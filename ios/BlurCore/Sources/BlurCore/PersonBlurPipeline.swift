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

        // The look (Joe, 2026-11-03: "more uncanny", "Leave the face and hair"): the body is erased into the scene
        // around it and the head is left floating. No outline, no box. The fill is sampled only from pixels outside
        // a widened person mask, so no skin, clothing or body detail can come back; a faint ghost of the outline may.
        let dimension = min(extent.width, extent.height)
        let hard = mask.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: max(2, dimension * 0.015)]).cropped(to: extent)
        // Pixels the fill may borrow from: clear of the person by a further margin (edge pixels mix body and scene).
        let source = Self.invert(hard.applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: max(2, dimension * 0.012)]).cropped(to: extent))
        let fill = Self.fill(original, valid: source, extent: extent)
        // Feathered, so the erased region has no edge of its own.
        var erase = hard.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: max(1, dimension * 0.008)]).cropped(to: extent)
        var keep = black
        for normalized in detection.faces {
            keep = Self.head(around: Self.pixels(normalized, in: extent), in: extent).applyingFilter("CIMaximumCompositing", parameters: [kCIInputBackgroundImageKey: keep]).cropped(to: extent)
        }
        erase = Self.blend(black, over: erase, mask: keep).cropped(to: extent)
        mask = erase
        // Where the head is kept the original is used unchanged (mask 0), so a face stays exactly as it was.
        let output = Self.blend(fill, over: original, mask: erase)
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
    private static func invert(_ image: CIImage) -> CIImage { image.applyingFilter("CIColorInvert") }

    /// colour / weight, for normalized convolution. Weight has a floor, so there is never a division by zero.
    private static let normalize = CIColorKernel(source: "kernel vec4 normalizeFill(__sample c, __sample w) { return vec4(c.rgb / max(w.r, 0.002), 1.0); }")!

    /// The scene continued into the erased region: normalized convolution at three scales, each pixel taking the
    /// finest scale that has enough scene (non-person) pixels around it. Only `valid` pixels contribute. Where no scale
    /// has any (a person fills the frame, or detection failed and everything is erased), a heavy pixelate and blur of
    /// the whole image is used instead, as before. Large blurs run on a downscaled copy, so this stays cheap.
    private static func fill(_ original: CIImage, valid: CIImage, extent: CGRect) -> CIImage {
        let dimension = max(extent.width, extent.height)
        let radius = max(18, min(extent.width, extent.height) / 20)
        var result = original.clampedToExtent()
            .applyingFilter("CIPixellate", parameters: [kCIInputScaleKey: max(14, radius * 1.2)])
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: radius]).cropped(to: extent)
        let premultiplied = blend(original, over: CIImage(color: .black).cropped(to: extent), mask: valid).cropped(to: extent)
        for (fraction, working) in [(0.25, 160.0), (0.09, 256.0), (0.03, 512.0)] as [(CGFloat, CGFloat)] {
            let scale = min(1, working / dimension)
            let small = extent.applying(CGAffineTransform(scaleX: scale, y: scale))
            func blurred(_ image: CIImage) -> CIImage {
                image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)).clampedToExtent()
                    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: max(1, dimension * fraction * scale)])
                    .cropped(to: small)
                    .transformed(by: CGAffineTransform(scaleX: 1 / scale, y: 1 / scale)).clampedToExtent().cropped(to: extent)
            }
            let weight = blurred(valid)
            guard let level = normalize.apply(extent: extent, arguments: [blurred(premultiplied), weight]) else { continue }
            let strength = weight.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 4, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 4, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 4, w: 0), "inputBiasVector": CIVector(x: -0.04, y: -0.04, z: -0.04, w: 0)
            ]).applyingFilter("CIColorClamp")
            result = blend(level.applyingFilter("CIColorClamp").cropped(to: extent), over: result, mask: strength).cropped(to: extent)
        }
        return result
    }

    /// Face and hair: a feathered ellipse over the face, reaching up and out for the hair and ending at the chin.
    private static func head(around face: CGRect, in extent: CGRect) -> CIImage {
        let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 0, y: 0), "inputRadius0": 100, "inputRadius1": 130,
            "inputColor0": CIColor.white, "inputColor1": CIColor.black
        ])!.outputImage!
        let transform = CGAffineTransform(translationX: face.midX, y: face.midY + face.height * 0.4)
            .scaledBy(x: face.width * 0.95 / 100, y: face.height * 0.9 / 100)
        return gradient.transformed(by: transform).cropped(to: extent)
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
