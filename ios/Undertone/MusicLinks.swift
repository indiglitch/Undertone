import SwiftUI
import CoreImage.CIFilterBuiltins

struct MusicRoute: Identifiable { let id = UUID(); let kind: String; let value: String }
struct CodeRoute: Identifiable { let id = UUID(); let url: URL }
@MainActor final class RouteCoordinator: ObservableObject {
    @Published var route: MusicRoute?
    @Published var code: CodeRoute?
    @Published var error: String?
    func open(_ url: URL) {
        guard let parsed = MusicLinks.parse(url) else { error = "Этот код не является ссылкой Undertone."; return }
        route = parsed
    }
}
enum MusicLinks {
    static func make(_ kind: String,_ value: String) -> URL {
        var parts = URLComponents(); parts.scheme = "undertone"; parts.host = kind; parts.queryItems = [URLQueryItem(name:"id",value:value)]
        return parts.url!
    }
    static func parse(_ url: URL) -> MusicRoute? {
        guard let parts = URLComponents(url:url,resolvingAgainstBaseURL:false), parts.scheme == "undertone",let kind = parts.host,["track","album","artist","playlist"].contains(kind), parts.user == nil,parts.password == nil,parts.port == nil,parts.fragment == nil,parts.path.isEmpty,parts.queryItems?.count == 1,parts.queryItems?.first?.name == "id",let value = parts.queryItems?.first?.value,!value.isEmpty,value.count <= 2000 else { return nil }
        return MusicRoute(kind:kind,value:value)
    }
}
struct MusicRouteView: View {
    @EnvironmentObject private var personal: PersonalLibrary
    @EnvironmentObject private var pc: PCConnection
    @Environment(\.dismiss) private var dismiss
    let route: MusicRoute
    var body: some View {
        NavigationStack {
            Group {
                switch route.kind {
                case "album": MusicLibraryView(album:route.value).navigationTitle(route.value)
                case "artist": MusicLibraryView(artist:route.value).navigationTitle(route.value)
                case "track": MusicLibraryView(orderedIDs:[route.value],showRoot:false).navigationTitle("Трек")
                default:
                    if pc.collections.playlists.contains(where:{$0.id == route.value.replacingOccurrences(of:"-",with:"").lowercased()}) { MusicLibraryView(playlistID:route.value.replacingOccurrences(of:"-",with:"").lowercased()).navigationTitle("Плейлист") }
                    else { ContentUnavailableView("Плейлист не найден",systemImage:"music.note.list",description:Text("Ссылка открывает объект в твоей библиотеке. Она не передаёт музыку или доступ к ПК.")) }
                }
            }.overlay(alignment:.top) { AppErrorToast().padding(.horizontal,16).padding(.top,8) }.toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { dismiss() } } }
        }
    }
}
struct MusicCodeView: View {
    let url: URL
    @State private var image: UIImage?
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack { VStack(spacing:24) {
            if let image { Image(uiImage:image).interpolation(.none).resizable().scaledToFit().frame(width:250,height:250).padding(15).background(.white,in:RoundedRectangle(cornerRadius:24)) }
            Text("Код Undertone").font(.title.bold())
            Text("Открывает объект в библиотеке получателя. Музыка и ключ подключения к ПК не передаются.").font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            ShareLink(item:url) { Label("SHARE LINK",systemImage:"square.and.arrow.up") }
        }.padding(24).navigationTitle("SHARE").toolbar { ToolbarItem(placement:.topBarTrailing) { Button("CLOSE") { dismiss() } } } }
        .task { let filter = CIFilter.qrCodeGenerator(); filter.message = Data(url.absoluteString.utf8); if let output = filter.outputImage, let cg = CIContext().createCGImage(output.transformed(by:CGAffineTransform(scaleX:8,y:8)),from:output.extent.applying(CGAffineTransform(scaleX:8,y:8))) { image = UIImage(cgImage:cg) } }
    }
}
