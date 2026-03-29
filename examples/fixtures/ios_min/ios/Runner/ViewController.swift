import UIKit

final class ViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    Task {
      _ = await fetchStatus()
    }
  }

  private func fetchStatus() async -> Bool {
    true
  }
}
