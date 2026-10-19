#[cfg(windows)]
fn main()->Result<(),Box<dyn std::error::Error>>{
 use windows::{Media::Control::GlobalSystemMediaTransportControlsSessionManager,Win32::System::WinRT::{RoInitialize,RO_INIT_MULTITHREADED}};
 unsafe{RoInitialize(RO_INIT_MULTITHREADED)?;}
 let manager=GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
 let sessions=manager.GetSessions()?;
 for index in 0..sessions.Size()?{
  let session=sessions.GetAt(index)?;let source=session.SourceAppUserModelId()?.to_string();
  if !source.to_lowercase().contains("undertone"){continue;}
  let action=std::env::args().nth(1).unwrap_or_else(||"query".into());
  let accepted=match action.as_str(){"play"=>Some(session.TryPlayAsync()?.get()?),"pause"=>Some(session.TryPauseAsync()?.get()?),"next"=>Some(session.TrySkipNextAsync()?.get()?),"previous"=>Some(session.TrySkipPreviousAsync()?.get()?),"toggle"=>Some(session.TryTogglePlayPauseAsync()?.get()?),_=>None};
  let media=session.TryGetMediaPropertiesAsync()?.get()?;let status=session.GetPlaybackInfo()?.PlaybackStatus()?;
  println!("{}",serde_json::json!({"source":source,"title":media.Title()?.to_string(),"artist":media.Artist()?.to_string(),"artwork":media.Thumbnail().is_ok(),"status":format!("{status:?}"),"accepted":accepted}));return Ok(())
 }
 Err("Undertone SMTC session not found".into())
}
#[cfg(not(windows))]
fn main(){println!("Windows only");}
