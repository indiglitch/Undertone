//! Windows SMTC adapter. Transport decisions remain in the existing frontend player.
use crate::database::Database;
use souvlaki::{MediaControlEvent,MediaControls,MediaMetadata,MediaPlayback,MediaPosition,PlatformConfig,SeekDirection};
use std::{path::{Path,PathBuf},sync::{mpsc,Arc,atomic::{AtomicBool,Ordering}},time::Duration};
use tauri::{Emitter,Manager,WebviewWindow};

pub struct MediaState { sender:mpsc::Sender<Update>,ready:Arc<AtomicBool> }
struct Update { db:Database,id:Option<i64>,playing:bool,position:f64,reply:mpsc::SyncSender<Result<bool,String>> }
struct Controls { native:MediaControls,track_id:Option<i64> }
#[derive(Clone,serde::Serialize)]
pub struct MediaEvent { pub action:&'static str,pub seconds:Option<f64> }
pub fn event(event:MediaControlEvent)->Option<MediaEvent>{
    let (action,seconds)=match event {
        MediaControlEvent::Play=>("play",None),MediaControlEvent::Pause=>("pause",None),
        MediaControlEvent::Toggle=>("toggle",None),MediaControlEvent::Next=>("next",None),
        MediaControlEvent::Previous=>("previous",None),MediaControlEvent::Stop=>("stop",None),
        MediaControlEvent::Seek(direction)=>("seek_by",Some(if direction==SeekDirection::Forward {10.0}else{-10.0})),
        MediaControlEvent::SeekBy(direction,duration)=>("seek_by",Some(duration.as_secs_f64()*if direction==SeekDirection::Forward {1.0}else{-1.0})),
        MediaControlEvent::SetPosition(position)=>("seek",Some(position.0.as_secs_f64())),_=>return None,
    };Some(MediaEvent{action,seconds})
}
impl MediaState {
    pub fn new(window:&WebviewWindow,data:&Path)->Self{
        let (sender,receiver)=mpsc::channel::<Update>();let ready=Arc::new(AtomicBool::new(false));let ready_worker=ready.clone();
        let fallback=data.join("media-default.png");let _=std::fs::write(&fallback,include_bytes!("../icons/128x128.png"));
        let hwnd=window.hwnd().map(|hwnd|hwnd.0 as usize).map_err(|e|e.to_string());let app=window.app_handle().clone();
        // WinRT starts off the UI startup path and keeps its apartment for the adapter lifetime.
        std::thread::spawn(move||{
            let create=(||->Result<Controls,String>{
                unsafe{windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED)}.map_err(|e|e.to_string())?;
                let hwnd=hwnd.map_err(|e|e.to_string())?;
                let mut native=MediaControls::new(PlatformConfig{display_name:"Undertone",dbus_name:"undertone",hwnd:Some(hwnd as *mut std::ffi::c_void)}).map_err(|e|e.to_string())?;
                native.attach(move|control|{if let Some(payload)=event(control){let _=app.emit("media-control",payload);}}).map_err(|e|e.to_string())?;
                native.set_playback(MediaPlayback::Stopped).map_err(|e|e.to_string())?;
                Ok(Controls{native,track_id:None})
            })();
            let mut controls=match create{Ok(controls)=>Some(controls),Err(error)=>{eprintln!("Windows media controls unavailable: {error}");None}};ready_worker.store(true,Ordering::Release);
            for update in receiver{let result=match controls.as_mut(){Some(controls)=>Self::apply(controls,&fallback,&update.db,update.id,update.playing,update.position),None=>Ok(false)};let _=update.reply.send(result);}
            drop(controls);unsafe{windows::Win32::System::WinRT::RoUninitialize();}
        });
        Self{sender,ready}
    }
    pub fn update(&self,db:&Database,id:Option<i64>,playing:bool,position:f64)->Result<bool,String>{
        if !self.ready.load(Ordering::Acquire){return Ok(false)}
        let (reply,receive)=mpsc::sync_channel(1);self.sender.send(Update{db:db.clone(),id,playing,position,reply}).map_err(|_|"Windows media controls unavailable")?;
        receive.recv_timeout(Duration::from_secs(3)).map_err(|_|"Windows media controls did not respond")?
    }
    fn apply(controls:&mut Controls,fallback:&Path,db:&Database,id:Option<i64>,playing:bool,position:f64)->Result<bool,String>{
        if !position.is_finite()||position<0.0{return Err("Invalid media position".into());}
        if controls.track_id!=id {
            let (title,artist,album,duration,cover)=if let Some(id)=id {db.connect()?.query_row(
                "SELECT t.title,a.name,al.title,t.duration,t.cover FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN albums al ON al.id=t.album_id WHERE t.id=?1",[id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,f64>(3)?,row.get::<_,Option<String>>(4)?))
            ).map_err(|_|"Media track is unavailable")?}else{(String::new(),String::new(),String::new(),0.0,None)};
            let path=cover.filter(|path|Path::new(path).is_file()).map(PathBuf::from).unwrap_or_else(||fallback.to_path_buf());
            // Souvlaki's Windows adapter expects a raw native path following file://.
            let cover_url=format!("file://{}",path.display());
            let metadata=MediaMetadata{title:Some(&title),artist:Some(&artist),album:Some(&album),cover_url:Some(&cover_url),duration:Some(Duration::from_secs_f64(if duration.is_finite(){duration.clamp(0.0,31_536_000.0)}else{0.0}))};
            controls.native.set_metadata(metadata).map_err(|e|e.to_string())?;controls.track_id=id;
        }
        let progress=Some(MediaPosition(Duration::from_secs_f64(position.min(31_536_000.0))));
        controls.native.set_playback(if id.is_none(){MediaPlayback::Stopped}else if playing{MediaPlayback::Playing{progress}}else{MediaPlayback::Paused{progress}}).map_err(|e|e.to_string())?;
        Ok(true)
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn windows_transport_events_keep_existing_player_actions(){
        assert_eq!(event(MediaControlEvent::Next).unwrap().action,"next");
        assert_eq!(event(MediaControlEvent::Previous).unwrap().action,"previous");
        assert_eq!(event(MediaControlEvent::Pause).unwrap().action,"pause");
        assert_eq!(event(MediaControlEvent::SetPosition(MediaPosition(Duration::from_secs(23)))).unwrap().seconds,Some(23.0));
        assert!(event(MediaControlEvent::OpenUri("ignored".into())).is_none());
    }
}
