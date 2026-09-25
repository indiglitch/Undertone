pub use crate::audio_source::VisualizerLevels;
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink};
use serde::{Deserialize, Serialize};
use std::{fs::File, sync::mpsc, time::Duration};

#[derive(Clone, Serialize, Default, Debug)]
pub struct Status {
    pub id: Option<i64>,
    pub playing: bool,
    pub position: f64,
    pub duration: f64,
    pub volume: f32,
    pub ended: bool,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Play { id: i64 },
    Pause,
    Resume,
    Seek { seconds: f64 },
    Volume { value: f32 },
    Stop,
    Status,
}
pub enum Message {
    Load {
        id: i64,
        path: String,
        duration: f64,
    },
    Control(Action),
}
type Request = (Message, mpsc::Sender<Result<Status, String>>);
pub struct Audio {
    sender: mpsc::Sender<Request>,
    meter: crate::audio_source::PeakMeter,
}
impl Audio {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel::<Request>();
        let meter = crate::audio_source::PeakMeter::default();
        let audio_meter = meter.clone();
        std::thread::spawn(move || {
            let mut output: Option<OutputStream> = None;
            let mut sink: Option<Sink> = None;
            let mut status = Status {
                volume: 0.65,
                ..Default::default()
            };
            for (message, reply) in receiver {
                let result = (|| -> Result<(), String> {
                    match message {
                        Message::Load { id, path, duration } => {
                            let decoder =
                                Decoder::try_from(File::open(path).map_err(|e| e.to_string())?)
                                    .map_err(|e| e.to_string())?;
                            if output.is_none() {
                                output = Some(
                                    OutputStreamBuilder::open_default_stream()
                                        .map_err(|e| format!("Аудиоустройство: {e}"))?,
                                );
                            }
                            let stream = output.as_ref().unwrap();
                            let source = crate::audio_source::prepare(
                                decoder,
                                stream.config().sample_rate(),
                                stream.config().channel_count(),
                            )?;
                            let next = sink.get_or_insert_with(|| {
                                crate::audio_source::connect_sink(
                                    stream.mixer(),
                                    stream.config().sample_rate(),
                                    stream.config().channel_count(),
                                )
                            });
                            next.set_volume(status.volume);
                            audio_meter.take();
                            crate::audio_source::replace(
                                next,
                                crate::audio_source::metered(source, audio_meter.clone()),
                            );
                            status.id = Some(id);
                            status.duration = duration;
                            status.ended = false;
                        }
                        Message::Control(action) => match action {
                            Action::Pause => {
                                if let Some(s) = &sink {
                                    s.pause();
                                }
                            }
                            Action::Resume => {
                                if let Some(s) = &sink {
                                    s.play();
                                }
                            }
                            Action::Seek { seconds } => {
                                if !seconds.is_finite()
                                    || seconds < 0.0
                                    || seconds > status.duration
                                {
                                    return Err("Некорректная позиция".into());
                                }
                                if let Some(s) = &sink {
                                    s.try_seek(Duration::from_secs_f64(seconds))
                                        .map_err(|e| e.to_string())?;
                                }
                            }
                            Action::Volume { value } => {
                                if !value.is_finite() || !(0.0..=1.0).contains(&value) {
                                    return Err("Некорректная громкость".into());
                                }
                                status.volume = value;
                                if let Some(s) = &sink {
                                    s.set_volume(value);
                                }
                            }
                            Action::Stop => {
                                if let Some(s) = &sink {
                                    s.stop();
                                }
                                status.id = None;
                                status.duration = 0.0;
                            }
                            Action::Status => (),
                            Action::Play { .. } => {
                                return Err("Play requires a library track".into())
                            }
                        },
                    }
                    Ok(())
                })();
                status.position = if status.id.is_some() {
                    sink.as_ref().map_or(0.0, |s| s.get_pos().as_secs_f64())
                } else {
                    0.0
                };
                status.playing = status.id.is_some()
                    && sink.as_ref().is_some_and(|s| !s.is_paused() && !s.empty());
                status.ended = status.id.is_some() && sink.as_ref().is_some_and(|s| s.empty());
                let _ = reply.send(result.map(|_| status.clone()));
            }
        });
        Self { sender, meter }
    }
    pub fn request(&self, message: Message) -> Result<Status, String> {
        let (tx, rx) = mpsc::channel();
        self.sender.send((message, tx)).map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|e| e.to_string())?
    }

    pub fn take_levels(&self) -> crate::audio_source::VisualizerLevels {
        self.meter.take()
    }
}
