#ifndef UNDERTONE_VORBIS_H
#define UNDERTONE_VORBIS_H
#include <stdint.h>
typedef struct stb_vorbis UT_Vorbis;
UT_Vorbis *ut_vorbis_open(const char *path, int *error);
void ut_vorbis_close(UT_Vorbis *stream);
int ut_vorbis_channels(UT_Vorbis *stream);
uint32_t ut_vorbis_rate(UT_Vorbis *stream);
uint32_t ut_vorbis_length(UT_Vorbis *stream);
int ut_vorbis_read(UT_Vorbis *stream, float *buffer, int floats);
int ut_vorbis_seek(UT_Vorbis *stream, uint32_t frame);
#endif
