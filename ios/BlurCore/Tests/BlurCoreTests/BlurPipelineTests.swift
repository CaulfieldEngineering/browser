import XCTest
import CoreImage
@testable import BlurCore

final class BlurPipelineTests: XCTestCase {
    private let extent = CGRect(x: 0, y: 0, width: 256, height: 256)
    private struct Detector: PersonDetecting {
        var result: PersonDetection?
        func detect(_ image: CGImage, moving: Bool) throws -> PersonDetection {
            guard let result else { throw NSError(domain: "Synthetic detector failure", code: 1) }
            return result
        }
    }
    private func fixture() -> CGImage {
        // Fine pattern makes missing blur obvious and permits exact face comparisons.
        let checker = CIFilter(name: "CICheckerboardGenerator", parameters: [
            "inputColor0": CIColor(red: 0.9, green: 0.2, blue: 0.1),
            "inputColor1": CIColor(red: 0.1, green: 0.3, blue: 0.9), "inputWidth": 4
        ])!.outputImage!.cropped(to: extent)
        return CIContext().createCGImage(checker, from: extent)!
    }
    private func pixel(_ image: CGImage, _ x: Int, _ y: Int) -> [UInt8] {
        var result = [UInt8](repeating: 0, count: 4)
        CIContext().render(CIImage(cgImage: image), toBitmap: &result, rowBytes: 4,
                           bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return result
    }
    private func detection() -> PersonDetection {
        let black = CIImage(color: .black).cropped(to: extent)
        let body = CIImage(color: .white).cropped(to: CGRect(x: 64, y: 16, width: 128, height: 224))
        return PersonDetection(mask: body.composited(over: black), faces: [CGRect(x: 0.4, y: 0.7, width: 0.2, height: 0.2)])
    }
    func testBodyChangesFaceIsExactAndBackgroundIsExact() throws {
        let input = fixture()
        let result = try PersonBlurPipeline(detector: Detector(result: detection())).process(input)
        XCTAssertNotEqual(pixel(input, 124, 92), pixel(result.image, 124, 92))
        XCTAssertEqual(pixel(input, 124, 204), pixel(result.image, 124, 204))
        XCTAssertEqual(pixel(input, 12, 92), pixel(result.image, 12, 92))
        XCTAssertGreaterThan(pixel(result.bodyMask, 124, 92)[0], 245)
        XCTAssertLessThan(pixel(result.bodyMask, 124, 204)[0], 5)
        XCTAssertFalse(result.usedFallback)
    }
    func testStrongSolidOutline() throws {
        let result = try PersonBlurPipeline(detector: Detector(result: detection())).process(fixture())
        let edge = pixel(result.image, 62, 100)
        XCTAssertLessThan(Int(edge[0]) + Int(edge[1]) + Int(edge[2]), 110)
    }
    func testUnknownPersonAndDetectorFailureFailClosed() throws {
        let input = fixture()
        let result = try PersonBlurPipeline(detector: Detector(result: nil)).process(input)
        XCTAssertTrue(result.usedFallback)
        XCTAssertNotEqual(pixel(input, 12, 92), pixel(result.image, 12, 92))
        XCTAssertGreaterThan(pixel(result.bodyMask, 12, 92)[0], 245)
    }
    func testEmptySegmentationWithKnownPersonStillCoversBody() throws {
        let detection = PersonDetection(mask: CIImage(color: .black).cropped(to: extent), bodies: [CGRect(x: 0.25, y: 0.1, width: 0.5, height: 0.8)])
        let result = try PersonBlurPipeline(detector: Detector(result: detection)).process(fixture())
        XCTAssertTrue(result.usedFallback)
        XCTAssertGreaterThan(pixel(result.bodyMask, 124, 92)[0], 245)
    }
    func testNoPersonLeavesImageUnchanged() throws {
        let input = fixture()
        let detection = PersonDetection(mask: CIImage(color: .black).cropped(to: extent))
        let result = try PersonBlurPipeline(detector: Detector(result: detection)).process(input)
        XCTAssertEqual(pixel(input, 124, 92), pixel(result.image, 124, 92))
    }
    func testNoDemographicExceptions() throws {
        // This pipeline intentionally has no sex/gender classifier or exemption. Identical masks always
        // produce identical protection, for women, men and people whose appearance is ambiguous.
        let pipeline = PersonBlurPipeline(detector: Detector(result: detection()))
        let first = try pipeline.process(fixture())
        let second = try pipeline.process(fixture())
        XCTAssertEqual(pixel(first.image, 124, 92), pixel(second.image, 124, 92))
    }
    func testDecodeLimitsAndEncodedOutput() throws {
        XCTAssertThrowsError(try PersonBlurPipeline.decode(Data("not an image".utf8)))
        let encoded = try PersonBlurPipeline.jpeg(fixture())
        let decoded = try PersonBlurPipeline.decode(encoded, maximumDimension: 128)
        XCTAssertEqual(decoded.width, 128)
        XCTAssertEqual(decoded.height, 128)
    }
    func testMeasuredPipelinePerformance() throws {
        let pipeline = PersonBlurPipeline(detector: Detector(result: detection()))
        let input = fixture()
        var times: [Double] = []
        for _ in 0..<5 { times.append(try pipeline.process(input).milliseconds) }
        print("BLUR_RENDER_256PX_MS " + times.map { String(format: "%.2f", $0) }.joined(separator: ","))
        // A hang/regression guard, not a claim about Vision speed or iPhone 13 Pro performance.
        XCTAssertLessThan(times.max()!, 10_000)
    }
}
