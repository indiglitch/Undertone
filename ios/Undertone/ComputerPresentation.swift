import Foundation

enum ComputerPresentation: Equatable {
    case unpaired, connecting, refreshing, offline, available, unavailable
    static func state(paired: Bool, connecting: Bool, refreshing: Bool, offline: Bool, online: Bool) -> Self {
        if connecting { return .connecting }
        if !paired { return .unpaired }
        if offline { return .offline }
        if refreshing { return .refreshing }
        return online ? .available : .unavailable
    }
    var title: String {
        switch self {
        case .unpaired: return "Компьютер не подключён"
        case .connecting: return "Подключение…"
        case .refreshing: return "Обновление каталога…"
        case .offline: return "Офлайн-режим"
        case .available: return "ПК доступен"
        case .unavailable: return "ПК пока недоступен"
        }
    }
    var detail: String {
        switch self {
        case .unpaired: return "На ПК открой Undertone → Настройки → Музыка на iPhone. Включи доступ. Подключи iPhone и ПК к одной сети Wi-Fi."
        case .connecting: return "Проверяем код и запрашиваем каталог."
        case .refreshing: return "Обновляем список музыки и синхронизируем изменения коллекций."
        case .offline: return "Подключение сохранено. Для обновления каталога и новых передач отключи офлайн-режим в Settings. Музыка на iPhone доступна."
        case .available: return "Каталог доступен. Сохранённую музыку можно слушать без ПК."
        case .unavailable: return "Подключение сохранено. Проверь Wi-Fi, запущенный Undertone и доступ на ПК. Сохранённая музыка остаётся доступна."
        }
    }
}
