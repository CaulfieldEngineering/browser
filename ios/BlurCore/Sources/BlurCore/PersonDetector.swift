import CoreImage
import Vision

public struct PersonDetection {
    public let mask: CIImage?
    /// Vision coordinates: normalized, bottom-left origin.
    public let faces: [CGRect]
    public let bodies: [CGRect]
    public init(mask: CIImage?, faces: [CGRect] = [], bodies: [CGRect] = []) {
        self.mask = mask; self.faces = faces; self.bodies = bodies
    }
}

public protocol PersonDetecting {
    func detect(_ image: CGImage, moving: Bool) throws -> PersonDetection
}

/// No demographic inference or third-party models. Every detected body receives the same treatment.
public final class ApplePersonDetector: PersonDetecting {
    public init() {}
    public func detect(_ image: CGImage, moving: Bool) throws -> PersonDetection {
        let handler = VNImageRequestHandler(cgImage: image, orientation: .up)
        let faces = VNDetectFaceRectanglesRequest()
        let bodies = VNDetectHumanRectanglesRequest()
        bodies.upperBodyOnly = false
        try handler.perform([faces, bodies])
        let faceRects = (faces.results ?? []).filter { $0.confidence >= 0.75 }.map(\.boundingBox)
        let bodyRects = (bodies.results ?? []).map(\.boundingBox)

        // Still images get the refined, high-resolution instance masks. Video uses the lower latency request.
        if !moving {
            let people = VNGeneratePersonInstanceMaskRequest()
            do {
                try handler.perform([people])
                if let result = people.results?.first, !result.allInstances.isEmpty {
                    let buffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
                    return PersonDetection(mask: CIImage(cvPixelBuffer: buffer), faces: faceRects, bodies: bodyRects)
                }
            } catch {
                // Older hardware / unsupported execution devices use the semantic segmentation below.
            }
        }
        let people = VNGeneratePersonSegmentationRequest()
        people.qualityLevel = moving ? .balanced : .accurate
        people.outputPixelFormat = kCVPixelFormatType_OneComponent8
        try handler.perform([people])
        guard let result = people.results?.first else { throw DetectionError.noResult }
        return PersonDetection(mask: CIImage(cvPixelBuffer: result.pixelBuffer), faces: faceRects, bodies: bodyRects)
    }
    private enum DetectionError: Error { case noResult }
}
