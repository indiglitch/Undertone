//! Offline PCM audit of the actual Rodio Sink + Mixer path; no gain correction.
use rodio::{
    buffer::SamplesBuffer,
    cpal::traits::{DeviceTrait, HostTrait},
    Decoder, OutputStreamBuilder, Sink, Source,
};
use serde_json::json;
use std::{
    fs::{self, File},
    io::{BufWriter, Write},
    path::Path,
};

fn write_pcm(path: &Path, samples: &[f32]) {
    let mut file = BufWriter::new(File::create(path).unwrap());
    for s in samples {
        file.write_all(&s.to_le_bytes()).unwrap();
    }
}
fn stats(data: &[f32]) -> serde_json::Value {
    json!({"samples":data.len(),"peak":data.iter().fold(0.0f32,|p,s|p.max(s.abs())),"over_full_scale":data.iter().filter(|s|s.abs()>1.0).count(),"non_finite":data.iter().filter(|s|!s.is_finite()).count()})
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let out = Path::new(&args[1]);
    fs::create_dir_all(out).unwrap();
    let device = rodio::cpal::default_host().default_output_device().unwrap();
    let default = device.default_output_config().unwrap();
    let stream = OutputStreamBuilder::open_default_stream().unwrap();
    let rate = stream.config().sample_rate();
    let channels = stream.config().channel_count();
    let device_info = json!({"name":device.name().unwrap(),"default_sample_rate":default.sample_rate().0,"default_channels":default.channels(),"default_sample_format":format!("{:?}",default.sample_format()),"stream_sample_rate":rate,"stream_channels":channels,"stream_sample_format":format!("{:?}",stream.config().sample_format())});
    drop(stream);
    let mut results = Vec::new();
    for (index, path) in args[2..].iter().enumerate() {
        let decoder = Decoder::try_from(File::open(path).unwrap()).unwrap();
        let sr = decoder.sample_rate();
        let ch = decoder.channels();
        let samples: Vec<f32> = decoder.collect();
        let stem = format!("track-{index}");
        write_pcm(&out.join(format!("{stem}-decoded.f32")), &samples);
        let mut volumes = Vec::new();
        for gain in [1.0f32, 0.8, 0.5] {
            let (mixer, mut rendered) = rodio::mixer::mixer(channels, rate);
            let sink = undertone::audio_source::connect_sink(&mixer, rate, channels);
            sink.set_volume(gain);
            sink.append(
                undertone::audio_source::prepare(
                    SamplesBuffer::new(ch, sr, samples.clone()),
                    rate,
                    channels,
                )
                .unwrap(),
            );
            let count = ((samples.len() / ch as usize) as u64 * rate as u64 / sr as u64) as usize
                * channels as usize;
            let output: Vec<_> = rendered.by_ref().take(count).collect();
            write_pcm(
                &out.join(format!("{stem}-{}-output.f32", (gain * 100.0) as u32)),
                &output,
            );
            volumes.push(json!({"volume":gain,"output":stats(&output)}));
        }
        results.push(json!({"path":path,"stem":stem,"source_rate":sr,"source_channels":ch,"decoded":stats(&samples),"volumes":volumes}));
    }
    // Quantify stop/new-sink overlap without any device or musical ambiguity.
    let (mixer, mut rendered) = rodio::mixer::mixer(2, 48000);
    let old = Sink::connect_new(&mixer);
    old.append(SamplesBuffer::new(2, 48000, vec![0.75; 48000]));
    for _ in 0..2 {
        rendered.next();
    }
    old.stop();
    let new = Sink::connect_new(&mixer);
    new.append(SamplesBuffer::new(2, 48000, vec![0.75; 48000]));
    let overlap: Vec<_> = rendered.take(960).collect();
    let report = json!({"device":device_info,"tracks":results,"phase1_stop_new_sink_overlap":stats(&overlap)});
    fs::write(
        out.join("measurement.json"),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}
