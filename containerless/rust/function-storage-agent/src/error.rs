use std::io;

#[derive(Debug)]
pub enum Error {
    IO(io::Error),
    FileNotFound(String),
    FileConflict(String),
}

impl std::convert::From<io::Error> for Error {
    fn from(error: io::Error) -> Error {
        Error::IO(error)
    }
}