# agentplugins Homebrew Formula
#
# This formula lives in the main repo for versioning. To use it:
#
# Option A — Direct install (no tap needed):
#   brew install https://raw.githubusercontent.com/sigilco/agentplugins/main/homebrew/Formula/agentplugins.rb
#
# Option B — Via tap (after creating sigilco/homebrew-tap):
#   brew tap sigilco/tap https://github.com/sigilco/homebrew-tap
#   brew install agentplugins
#
class Agentplugins < Formula
  desc "Write AI agent plugins once, ship to any harness"
  homepage "https://github.com/sigilco/agentplugins"
  version "0.2.0"

  on_macos do
    on_arm do
      url "https://github.com/sigilco/agentplugins/releases/download/v#{version}/agentplugins-aarch64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_ARM64_DARWIN_SHA256"
    end
    on_intel do
      url "https://github.com/sigilco/agentplugins/releases/download/v#{version}/agentplugins-x86_64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_X64_DARWIN_SHA256"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/sigilco/agentplugins/releases/download/v#{version}/agentplugins-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "PLACEHOLDER_ARM64_LINUX_SHA256"
    end
    on_intel do
      url "https://github.com/sigilco/agentplugins/releases/download/v#{version}/agentplugins-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "PLACEHOLDER_X64_LINUX_SHA256"
    end
  end

  def install
    # The tarball contains a single binary named "agentplugins-<target>"
    bin.install "agentplugins-aarch64-apple-darwin" => "agentplugins" if Hardware::CPU.arm? && OS.mac?
    bin.install "agentplugins-x86_64-apple-darwin" => "agentplugins" if Hardware::CPU.intel? && OS.mac?
    bin.install "agentplugins-aarch64-unknown-linux-gnu" => "agentplugins" if Hardware::CPU.arm? && OS.linux?
    bin.install "agentplugins-x86_64-unknown-linux-gnu" => "agentplugins" if Hardware::CPU.intel? && OS.linux?
  end

  test do
    assert_match "0.2.0", shell_output("#{bin}/agentplugins --version")
    assert_match "Usage", shell_output("#{bin}/agentplugins --help")
  end
end
