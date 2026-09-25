use crate::audio_source::{connect_sink, metered, prepare, replace, PeakMeter};
use rodio::{buffer::SamplesBuffer, Source};
use std::{sync::Arc, time::Duration};

#[test]
fn peak_meter_reports_real_pcm_without_changing_it() {
    let meter = PeakMeter::default();
    let values = vec![-0.2, 0.7, -0.45, 0.1];
    let output =
        metered(SamplesBuffer::new(1, 44100, values.clone()), meter.clone()).collect::<Vec<_>>();
    assert_eq!(output, values);
    let levels = meter.take();
    assert!((levels.energy - 0.7).abs() < f32::EPSILON);
    assert!(levels.bins.iter().any(|value| *value > 0.0));
    assert_eq!(
        meter.take().energy,
        0.0,
        "reading starts a fresh meter window"
    );
}

#[test]
fn visualizer_filter_bank_distinguishes_low_and_high_tones() {
    let analyze = |frequency: f32| {
        let meter = PeakMeter::default();
        let samples = (0..16_384)
            .map(|index| (std::f32::consts::TAU * frequency * index as f32 / 48_000.0).sin() * 0.5)
            .collect::<Vec<_>>();
        let mut source = metered(SamplesBuffer::new(1, 48_000, samples), meter.clone());
        source.by_ref().take(4096).for_each(drop);
        meter.take();
        source.for_each(drop);
        meter.take()
    };
    let low = analyze(90.0);
    let high = analyze(6000.0);
    assert!(
        low.bass > low.highs,
        "90 Hz should favor bass bands: {low:?}"
    );
    assert!(
        high.highs > high.bass,
        "6 kHz should favor high bands: {high:?}"
    );
}

#[test]
fn pcm_bypass_volume_and_channels_are_transparent() {
    let values = vec![-1.023, 0.98, 0.23, -0.57, 0.0, 1.02];
    for gain in [1.0f32, 0.8, 0.5] {
        let (mixer, rendered) = rodio::mixer::mixer(2, 44100);
        let sink = connect_sink(&mixer, 44100, 2);
        sink.set_volume(gain);
        sink.append(prepare(SamplesBuffer::new(2, 44100, values.clone()), 44100, 2).unwrap());
        assert_eq!(
            rendered.take(values.len()).collect::<Vec<_>>(),
            values.iter().map(|v| v * gain).collect::<Vec<_>>()
        );
    }
    let mono = prepare(
        SamplesBuffer::new(2, 44100, vec![0.2, 0.6, -0.4, 0.2]),
        44100,
        1,
    )
    .unwrap()
    .collect::<Vec<_>>();
    assert_eq!(mono, vec![0.4, -0.1]);
    let stereo = prepare(SamplesBuffer::new(1, 44100, vec![0.2, -0.4]), 44100, 2)
        .unwrap()
        .collect::<Vec<_>>();
    assert_eq!(stereo, vec![0.2, 0.2, -0.4, -0.4]);
}

#[test]
fn replacement_never_sums_two_tracks() {
    let (mixer, mut rendered) = rodio::mixer::mixer(2, 48000);
    let sink = Arc::new(connect_sink(&mixer, 48000, 2));
    sink.append(SamplesBuffer::new(2, 48000, vec![0.75; 48000]));
    rendered.next();
    rendered.next();
    let other = sink.clone();
    let worker = std::thread::spawn(move || {
        replace(&other, SamplesBuffer::new(2, 48000, vec![0.75; 48000]))
    });
    let mut peak = 0.0f32;
    for _ in 0..1_000_000 {
        peak = peak.max(rendered.next().unwrap_or(0.0).abs());
        if worker.is_finished() {
            break;
        }
        std::thread::yield_now();
    }
    assert!(
        worker.is_finished(),
        "replacement must finish after draining old source"
    );
    worker.join().unwrap();
    for s in rendered.take(1024) {
        peak = peak.max(s.abs());
    }
    assert_eq!(peak, 0.75, "old and new track must never be mixed");
}

#[test]
fn resampler_preserves_passband_rejects_aliasing_and_flushes_tail() {
    for (from, to) in [(96000, 44100), (48000, 44100), (44100, 48000)] {
        let tone = |hz: f64| {
            (0..from)
                .flat_map(|i| {
                    let x =
                        (std::f64::consts::TAU * hz * i as f64 / from as f64).sin() as f32 * 0.5;
                    [x, x]
                })
                .collect::<Vec<_>>()
        };
        let output = prepare(SamplesBuffer::new(2, from, tone(1000.0)), to, 2)
            .unwrap()
            .collect::<Vec<_>>();
        assert_eq!(output.len(), to as usize * 2);
        let rms = (output[4000..output.len() - 4000]
            .iter()
            .map(|s| (*s as f64).powi(2))
            .sum::<f64>()
            / (output.len() - 8000) as f64)
            .sqrt();
        assert!(
            (rms - 0.5 / 2f64.sqrt()).abs() < 0.002,
            "passband gain: {rms}"
        );
        if from == 96000 {
            let alias = prepare(SamplesBuffer::new(2, from, tone(30000.0)), to, 2)
                .unwrap()
                .collect::<Vec<_>>();
            let rms = (alias[4000..alias.len() - 4000]
                .iter()
                .map(|s| (*s as f64).powi(2))
                .sum::<f64>()
                / (alias.len() - 8000) as f64)
                .sqrt();
            println!(
                "30kHz 96k->44.1k alias RMS={rms}, dBFS={}",
                20.0 * rms.log10()
            );
            assert!(
                rms < 0.0001,
                "anti-alias filter must suppress above-Nyquist content"
            );
        }
        let mut source = prepare(SamplesBuffer::new(2, from, tone(1000.0)), to, 2).unwrap();
        source.by_ref().take(3000).for_each(drop);
        source.try_seek(Duration::ZERO).unwrap();
        let after = source.collect::<Vec<_>>();
        assert_eq!(after, output, "seek clears filter history and buffers");
    }
    for length in [0, 1, 31, 1024, 1025] {
        let output = prepare(SamplesBuffer::new(1, 48000, vec![0.1; length]), 44100, 1)
            .unwrap()
            .collect::<Vec<_>>();
        assert_eq!(output.len(), (length * 44100 + 24000) / 48000);
        assert!(output.iter().all(|s| s.is_finite()));
    }
}
