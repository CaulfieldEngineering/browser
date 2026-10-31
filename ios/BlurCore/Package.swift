// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BlurCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "BlurCore", targets: ["BlurCore"])],
    targets: [
        .target(name: "BlurCore"),
        .testTarget(name: "BlurCoreTests", dependencies: ["BlurCore"], resources: [.copy("Fixtures")])
    ]
)
