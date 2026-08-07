#ifndef FLODER_READER_H
#define FLODER_READER_H

#include <string>

namespace amsys {

// Read the first line of a .floder file.
// Given a directory path (e.g. "C:\Users"), looks for "C:\Users\Users.floder"
// (the .floder name matches the last directory component).
// Returns the expanded first line if found, empty string otherwise.
std::string read_floder(const std::string& dir_path);

} // namespace amsys

#endif // FLODER_READER_H
