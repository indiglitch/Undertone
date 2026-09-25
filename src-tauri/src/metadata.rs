use lofty::{
    file::{AudioFile, TaggedFileExt},
    picture::PictureType,
    prelude::{Accessor, ItemKey},
};
use sha2::{Digest, Sha256};
use std::path::Path;

pub struct LocalMetadata;
impl crate::providers::MetadataProvider for LocalMetadata {
    fn read(&self, path: &Path, covers: &Path) -> Result<Metadata, String> {
        read(path, covers)
    }
}

pub struct Metadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub track_number: Option<u32>,
    pub year: Option<u32>,
    pub duration: f64,
    pub genre: String,
    pub cover: Option<String>,
    pub format: String,
}
pub fn supported(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| {
        matches!(
            e.to_ascii_lowercase().as_str(),
            "mp3" | "flac" | "m4a" | "aac" | "ogg" | "wav"
        )
    })
}
pub fn read(path: &Path, covers: &Path) -> Result<Metadata, String> {
    let file = lofty::read_from_path(path).map_err(|e| e.to_string())?;
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let title = tag
        .and_then(|t| t.title())
        .map(|s| s.into_owned())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
    let artist = tag
        .and_then(|t| t.artist())
        .map(|s| s.into_owned())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Неизвестный исполнитель".into());
    let album = tag
        .and_then(|t| t.album())
        .map(|s| s.into_owned())
        .unwrap_or_else(|| "Без альбома".into());
    let album_artist = tag
        .and_then(|t| t.get_string(ItemKey::AlbumArtist))
        .unwrap_or(&artist)
        .to_string();
    let picture = tag.and_then(|t| {
        t.pictures()
            .iter()
            .find(|p| p.pic_type() == PictureType::CoverFront)
            .or_else(|| t.pictures().first())
    });
    // An unreadable image must not discard an otherwise playable track.
    let cover = picture.and_then(|p| cache_cover(p.data(), covers).ok());
    Ok(Metadata {
        title,
        artist,
        album,
        album_artist,
        cover,
        track_number: tag.and_then(|t| t.track()),
        year: tag.and_then(|t| t.date()).map(|d| u32::from(d.year)),
        duration: file.properties().duration().as_secs_f64(),
        genre: tag
            .and_then(|t| t.genre())
            .map(|s| s.into_owned())
            .unwrap_or_default(),
        format: path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_ascii_uppercase(),
    })
}
fn cache_cover(bytes: &[u8], covers: &Path) -> Result<String, String> {
    let dest = covers.join(format!("{:x}.jpg", Sha256::digest(bytes)));
    if !dest.exists() {
        let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(12000);
        limits.max_image_height = Some(12000);
        reader.limits(limits);
        let img = reader
            .decode()
            .map_err(|e| e.to_string())?
            .thumbnail(480, 480)
            .to_rgb8();
        let temp = dest.with_extension("tmp");
        img.save_with_format(&temp, image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        std::fs::rename(temp, &dest).map_err(|e| e.to_string())?;
    }
    Ok(dest.to_string_lossy().into_owned())
}
