import SwiftUI

/// Deliberately ugly. Everything on this screen is a measurement.
struct ContentView: View {
    @StateObject private var spike = NearbySpike()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            HStack {
                Button("Restart session") { spike.restart() }
                    .buttonStyle(.borderedProminent)
                Spacer()
                Button("Copy log") {
                    UIPasteboard.general.string = spike.transcript
                }
                .buttonStyle(.bordered)
            }

            Divider()

            Text("Event log")
                .font(.headline)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 4) {
                    ForEach(spike.log) { entry in
                        HStack(alignment: .top, spacing: 8) {
                            Text(entry.at, format: .dateTime.hour().minute().second())
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                            Text(entry.text)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(
                                    entry.text.hasPrefix("***") ? .red : .primary
                                )
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .onAppear { spike.start() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NI background spike")
                .font(.largeTitle.bold())

            LabeledContent("State") {
                Text(spike.state.rawValue)
                    .font(.system(.body, design: .monospaced).bold())
            }

            LabeledContent("Distance") {
                Text(
                    spike.distance.map { String(format: "%.2f m", $0) } ?? "—"
                )
                .font(.system(.body, design: .monospaced))
            }

            LabeledContent("Time to first reading") {
                Text(spike.msToFirstReading.map { "\($0) ms" } ?? "—")
                    .font(.system(.body, design: .monospaced))
            }
        }
    }
}

#Preview {
    ContentView()
}
