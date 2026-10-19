#include "UndertoneVorbis.h"
#define STB_VORBIS_NO_PUSHDATA_API
#include "stb_vorbis.c"
UT_Vorbis *ut_vorbis_open(const char *path, int *error) { return stb_vorbis_open_filename(path,error,NULL); }
void ut_vorbis_close(UT_Vorbis *stream) { stb_vorbis_close(stream); }
int ut_vorbis_channels(UT_Vorbis *stream) { return stb_vorbis_get_info(stream).channels; }
uint32_t ut_vorbis_rate(UT_Vorbis *stream) { return stb_vorbis_get_info(stream).sample_rate; }
uint32_t ut_vorbis_length(UT_Vorbis *stream) { return stb_vorbis_stream_length_in_samples(stream); }
int ut_vorbis_read(UT_Vorbis *stream,float *buffer,int floats) { return stb_vorbis_get_samples_float_interleaved(stream,ut_vorbis_channels(stream),buffer,floats); }
int ut_vorbis_seek(UT_Vorbis *stream,uint32_t frame) { return stb_vorbis_seek(stream,frame); }
