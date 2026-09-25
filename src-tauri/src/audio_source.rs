//! Device-rate PCM with a bypass for matching rates. No normalization or dynamics DSP.
use rodio::{source::SeekError, Source};
use rubato::{FftFixedIn, Resampler};
use std::{
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
    time::Duration,
};

const VISUALIZER_BINS: usize = 8;

#[derive(Clone, serde::Serialize, Debug, Default)]
pub struct VisualizerLevels {
    pub energy: f32,
    pub bass: f32,
    pub mids: f32,
    pub highs: f32,
    pub bins: [f32; VISUALIZER_BINS],
}

struct MeterAtoms {
    energy: AtomicU32,
    bins: [AtomicU32; VISUALIZER_BINS],
}
impl Default for MeterAtoms {
    fn default() -> Self {
        Self {
            energy: AtomicU32::new(0),
            bins: std::array::from_fn(|_| AtomicU32::new(0)),
        }
    }
}

#[derive(Clone, Default)]
pub struct PeakMeter(Arc<MeterAtoms>);

impl PeakMeter {
    pub fn take(&self) -> VisualizerLevels {
        let energy = f32::from_bits(self.0.energy.swap(0, Ordering::Relaxed));
        let bins = std::array::from_fn(|index| {
            f32::from_bits(self.0.bins[index].swap(0, Ordering::Relaxed))
        });
        VisualizerLevels {
            energy,
            bass: (bins[0] + bins[1]) * 0.5,
            mids: (bins[2] + bins[3] + bins[4]) / 3.0,
            highs: (bins[5] + bins[6] + bins[7]) / 3.0,
            bins,
        }
    }
    fn publish(&self, energy: f32, bins: &[f32; VISUALIZER_BINS]) {
        self.0
            .energy
            .fetch_max(energy.min(1.0).to_bits(), Ordering::Relaxed);
        for (target, value) in self.0.bins.iter().zip(bins) {
            target.fetch_max(value.min(1.0).to_bits(), Ordering::Relaxed);
        }
    }
}

pub fn metered<S: Source<Item = f32>>(source: S, meter: PeakMeter) -> Metered<S> {
    let rate = source.sample_rate() as f32;
    let channels = source.channels().max(1) as usize;
    let cutoffs = [90.0, 180.0, 360.0, 720.0, 1400.0, 2800.0, 5600.0, 11200.0];
    Metered {
        source,
        meter,
        coefficients: cutoffs.map(|cutoff| 1.0 - (-std::f32::consts::TAU * cutoff / rate).exp()),
        filters: vec![[0.0; VISUALIZER_BINS]; channels],
        peaks: [0.0; VISUALIZER_BINS],
        energy_peak: 0.0,
        channel: 0,
        frames: 0,
        publish_every: (rate as usize / 200).max(64),
    }
}

pub struct Metered<S> {
    source: S,
    meter: PeakMeter,
    coefficients: [f32; VISUALIZER_BINS],
    filters: Vec<[f32; VISUALIZER_BINS]>,
    peaks: [f32; VISUALIZER_BINS],
    energy_peak: f32,
    channel: usize,
    frames: usize,
    publish_every: usize,
}
impl<S> Metered<S> {
    fn publish(&mut self) {
        self.meter.publish(self.energy_peak, &self.peaks);
        self.energy_peak = 0.0;
        self.peaks.fill(0.0);
        self.frames = 0;
    }
}
impl<S: Source<Item = f32>> Iterator for Metered<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        let Some(sample) = self.source.next() else {
            if self.frames > 0 {
                self.publish();
            }
            return None;
        };
        let filters = &mut self.filters[self.channel];
        let mut lower = 0.0;
        const GAINS: [f32; VISUALIZER_BINS] = [4.0, 3.2, 2.6, 2.2, 1.9, 1.65, 1.45, 1.3];
        for index in 0..VISUALIZER_BINS {
            filters[index] += self.coefficients[index] * (sample - filters[index]);
            let band = ((filters[index] - lower).abs() * GAINS[index]).min(1.0);
            self.peaks[index] = self.peaks[index].max(band);
            lower = filters[index];
        }
        self.energy_peak = self.energy_peak.max(sample.abs());
        self.channel += 1;
        if self.channel == self.filters.len() {
            self.channel = 0;
            self.frames += 1;
            if self.frames >= self.publish_every {
                self.publish();
            }
        }
        Some(sample)
    }
}
impl<S: Source<Item = f32>> Source for Metered<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.source.current_span_len()
    }
    fn channels(&self) -> u16 {
        self.source.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.source.try_seek(pos)?;
        self.filters.fill([0.0; VISUALIZER_BINS]);
        self.peaks.fill(0.0);
        self.energy_peak = 0.0;
        self.frames = 0;
        self.channel = 0;
        self.meter.take();
        Ok(())
    }
}

pub fn prepare<S: Source<Item = f32> + Send + 'static>(
    source: S,
    rate: u32,
    channels: u16,
) -> Result<Box<dyn Source<Item = f32> + Send>, String> {
    if rate == 0
        || channels == 0
        || source.sample_rate() == 0
        || !(1..=2).contains(&source.channels())
    {
        return Err("Поддерживаются моно/стерео треки и корректная частота вывода".into());
    }
    let source: Box<dyn Source<Item = f32> + Send> = if source.sample_rate() == rate {
        Box::new(source)
    } else {
        Box::new(BandLimited::new(source, rate)?)
    };
    if source.channels() == channels {
        Ok(source)
    } else {
        Ok(Box::new(ChannelMap {
            source,
            target: channels,
            frame: Vec::with_capacity(channels as usize),
            cursor: 0,
        }))
    }
}

struct BandLimited<S> {
    source: S,
    resampler: FftFixedIn<f32>,
    input: Vec<Vec<f32>>,
    output: Vec<Vec<f32>>,
    pending: Vec<f32>,
    cursor: usize,
    rate: u32,
    channels: u16,
    source_rate: u32,
    input_frames: u64,
    output_frames: u64,
    skip: usize,
    eof: bool,
}
impl<S: Source<Item = f32>> BandLimited<S> {
    fn new(source: S, rate: u32) -> Result<Self, String> {
        let channels = source.channels();
        let source_rate = source.sample_rate();
        let resampler = FftFixedIn::<f32>::new(
            source_rate as usize,
            rate as usize,
            1024,
            2,
            channels as usize,
        )
        .map_err(|e| e.to_string())?;
        let input = resampler.input_buffer_allocate(true);
        let output = resampler.output_buffer_allocate(true);
        let pending = Vec::with_capacity(resampler.output_frames_max() * channels as usize);
        let skip = resampler.output_delay();
        Ok(Self {
            source,
            resampler,
            input,
            output,
            pending,
            cursor: 0,
            rate,
            channels,
            source_rate,
            input_frames: 0,
            output_frames: 0,
            skip,
            eof: false,
        })
    }
    fn refill(&mut self) -> bool {
        self.pending.clear();
        self.cursor = 0;
        while self.pending.is_empty() {
            let target = (self.input_frames * self.rate as u64 + self.source_rate as u64 / 2)
                / self.source_rate as u64;
            if self.eof && self.output_frames >= target {
                return false;
            }
            for channel in &mut self.input {
                channel.fill(0.0);
            }
            for i in 0..self.resampler.input_frames_next() {
                if self.eof {
                    break;
                }
                for ch in 0..self.channels as usize {
                    if let Some(sample) = self.source.next() {
                        self.input[ch][i] = sample;
                    } else {
                        self.eof = true;
                        break;
                    }
                }
                if !self.eof {
                    self.input_frames += 1;
                }
            }
            // Buffer sizes come exclusively from this same resampler instance.
            let (_, written) = self
                .resampler
                .process_into_buffer(&self.input, &mut self.output, None)
                .expect("preallocated resampler buffers");
            let target = (self.input_frames * self.rate as u64 + self.source_rate as u64 / 2)
                / self.source_rate as u64;
            for frame in 0..written {
                if self.skip > 0 {
                    self.skip -= 1;
                    continue;
                }
                if self.eof && self.output_frames >= target {
                    break;
                }
                for ch in 0..self.channels as usize {
                    self.pending.push(self.output[ch][frame]);
                }
                self.output_frames += 1;
            }
        }
        true
    }
}
impl<S: Source<Item = f32>> Iterator for BandLimited<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.cursor == self.pending.len() && !self.refill() {
            return None;
        }
        let sample = self.pending[self.cursor];
        self.cursor += 1;
        Some(sample)
    }
}
impl<S: Source<Item = f32>> Source for BandLimited<S> {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        self.rate
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.source.try_seek(pos)?;
        self.resampler.reset();
        self.skip = self.resampler.output_delay();
        self.pending.clear();
        self.cursor = 0;
        self.input_frames = 0;
        self.output_frames = 0;
        self.eof = false;
        Ok(())
    }
}
struct ChannelMap {
    source: Box<dyn Source<Item = f32> + Send>,
    target: u16,
    frame: Vec<f32>,
    cursor: usize,
}
impl Iterator for ChannelMap {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.cursor == self.frame.len() {
            let left = self.source.next()?;
            let right = if self.source.channels() == 2 {
                self.source.next()?
            } else {
                left
            };
            self.frame.clear();
            self.cursor = 0;
            if self.target == 1 {
                self.frame.push((left + right) * 0.5);
            } else {
                self.frame.push(left);
                self.frame.push(right);
                self.frame.resize(self.target as usize, 0.0);
            }
        }
        let sample = self.frame[self.cursor];
        self.cursor += 1;
        Some(sample)
    }
}
impl Source for ChannelMap {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.target
    }
    fn sample_rate(&self) -> u32 {
        self.source.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.source.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.source.try_seek(pos)?;
        self.frame.clear();
        self.cursor = 0;
        Ok(())
    }
}

/// A single queue must be drained before its replacement begins (Sink::stop is asynchronous).
pub fn replace<S: Source<Item = f32> + Send + 'static>(sink: &rodio::Sink, source: S) {
    sink.stop();
    sink.append(source);
    sink.play();
}

/// Every queued source is already device-format PCM. Rodio's empty queue reports
/// mono/48k or mono/44.1k; letting Mixer convert that would alter track onsets.
pub fn connect_sink(mixer: &rodio::mixer::Mixer, rate: u32, channels: u16) -> rodio::Sink {
    let (sink, source) = rodio::Sink::new();
    mixer.add(DeviceFormat {
        source,
        rate,
        channels,
    });
    sink
}
struct DeviceFormat<S> {
    source: S,
    rate: u32,
    channels: u16,
}
impl<S: Source<Item = f32>> Iterator for DeviceFormat<S> {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        self.source.next()
    }
}
impl<S: Source<Item = f32>> Source for DeviceFormat<S> {
    fn current_span_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        self.rate
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.source.try_seek(pos)
    }
}
