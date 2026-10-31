import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UniformTypeIdentifiers

public struct BlurResult {
    public let image: CGImage
    public let bodyMask: CGImage
    public let usedFallback: Bool
    public let milliseconds: Double
}

/// Serial-queue confined. No networking, file access, logging or UIKit; also tested on macOS.
public final class PersonBlurPipeline {
    private let context: CIContext
    private let detector: PersonDetecting
    public init(detector: PersonDetecting = ApplePersonDetector(), context: CIContext = CIContext(options: [.cacheIntermediates: false])) {
        self.detector = detector; self.context = context
    }

    public func process(_ image: CGImage, moving: Bool = false) throws -> BlurResult {
        let start = CFAbsoluteTimeGetCurrent()
        let original = CIImage(cgImage: image)
        let extent = original.extent
        let detectScale = min(1, CGFloat(moving ? 512 : 1024) / max(extent.width, extent.height))
        let reduced = original.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: detectScale])
        guard let small = context.createCGImage(reduced, from: reduced.extent) else { throw BlurError.render }
        var fallback = false
        let detection: PersonDetection
        do { detection = try detector.detect(small, moving: moving) }
        catch { detection = PersonDetection(mask: nil); fallback = true }

        let black = CIImage(color: .black).cropped(to: extent)
        let white = CIImage(color: .white).cropped(to: extent)
        var mask: CIImage
        if let raw = detection.mask, raw.extent.width > 0, raw.extent.height > 0 {
            mask = raw.transformed(by: CGAffineTransform(scaleX: extent.width / raw.extent.width, y: extent.height / raw.extent.height)).cropped(to: extent)
            // Lift uncertain edge pixels before dilation; no low-confidence transparent body pixels.
            mask = mask.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 8, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 8, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 8, w: 0),
                "inputBiasVector": CIVector(x: -0.12, y: -0.12, z: -0.12, w: 0)
            ]).applyingFilter("CIColorClamp")
            // A separate human/face detector catches a failed or empty person mask. Never return a known
            // person's original body just because segmentation failed on that person.
            for rect in detection.bodies {
                let region = Self.pixels(rect, in: extent)
                if mean(mask, in: region) < 0.025 {
                    mask = white.cropped(to: region).composited(over: mask)
                    fallback = true
                }
            }
            if !detection.faces.isEmpty && detection.bodies.isEmpty && mean(mask, in: extent) < 0.005 {
                mask = white; fallback = true
            }
        } else { mask = white; fallback = true }

        let strokeWidth = max(2, min(extent.width, extent.height) / 180)
        mask = mask.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: max(1.5, strokeWidth)])
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.65]).cropped(to: extent)
        var faceMask = black
        for normalized in detection.faces {
            let face = Self.pixels(normalized, in: extent)
            // Slight expansion protects the face boundary. Keep the expansion small so the neck stays covered.
            let expanded = face.insetBy(dx: -face.width * 0.035, dy: -face.height * 0.035).intersection(extent)
            faceMask = white.cropped(to: expanded).composited(over: faceMask)
        }
        mask = Self.blend(black, over: mask, mask: faceMask).cropped(to: extent)
        let wide = mask.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: strokeWidth])
        let inner = mask.applyingFilter("CIMorphologyMinimum", parameters: [kCIInputRadiusKey: strokeWidth])
        var outline = Self.blend(black, over: wide, mask: inner).cropped(to: extent)
        outline = Self.blend(black, over: outline, mask: faceMask)

        let radius = max(18, min(extent.width, extent.height) / 20)
        let obscured = original.clampedToExtent()
            .applyingFilter("CIPixellate", parameters: [kCIInputScaleKey: max(14, radius * 1.2)])
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: radius])
            .cropped(to: extent)
        var output = Self.blend(obscured, over: original, mask: mask)
        let ink = CIImage(color: CIColor(red: 0.06, green: 0.07, blue: 0.09)).cropped(to: extent)
        output = Self.blend(ink, over: output, mask: outline)
        // Last operation restores faces exactly, including where outline dilation touched them.
        output = Self.blend(original, over: output, mask: faceMask)
        guard let rendered = context.createCGImage(output, from: extent), let renderedMask = context.createCGImage(mask, from: extent) else { throw BlurError.render }
        return BlurResult(image: rendered, bodyMask: renderedMask, usedFallback: fallback, milliseconds: (CFAbsoluteTimeGetCurrent() - start) * 1000)
    }

    private func mean(_ image: CIImage, in rect: CGRect) -> Float {
        guard !rect.isEmpty else { return 0 }
        let average = image.applyingFilter("CIAreaAverage", parameters: [kCIInputExtentKey: CIVector(cgRect: rect)])
        var pixel = [Float](repeating: 0, count: 4)
        context.render(average, toBitmap: &pixel, rowBytes: 16, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBAf, colorSpace: nil)
        return pixel[0]
    }
    private static func pixels(_ rect: CGRect, in extent: CGRect) -> CGRect {
        CGRect(x: rect.minX * extent.width, y: rect.minY * extent.height, width: rect.width * extent.width, height: rect.height * extent.height).intersection(extent)
    }
    private static func blend(_ foreground: CIImage, over background: CIImage, mask: CIImage) -> CIImage {
        foreground.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: background, kCIInputMaskImageKey: mask])
    }
    public static func decode(_ data: Data, maximumDimension: Int = 1536) throws -> CGImage {
        guard data.count <= 20 * 1024 * 1024, let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: max(128, min(2048, maximumDimension)),
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { throw BlurError.decode }
        return image
    }
    public static func jpeg(_ image: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { throw BlurError.render }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw BlurError.render }
        return data as Data
    }
    private enum BlurError: Error { case decode, render }
}
