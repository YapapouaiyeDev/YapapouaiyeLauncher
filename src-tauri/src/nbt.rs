use crate::paths::game_dir;
use crate::servers::SERVERS;
use std::fs;
use std::io::Write;

fn write_byte(buf: &mut Vec<u8>, v: i8) {
    buf.push(v as u8);
}

fn write_short(buf: &mut Vec<u8>, v: i16) {
    buf.extend_from_slice(&v.to_be_bytes());
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    write_short(buf, bytes.len() as i16);
    buf.extend_from_slice(bytes);
}

pub fn build_servers_nbt(server_list: &[(String, String)]) -> Vec<u8> {
    let mut buffers = Vec::new();
    write_byte(&mut buffers, 10);
    write_string(&mut buffers, "");
    write_byte(&mut buffers, 9);
    write_string(&mut buffers, "servers");
    write_byte(&mut buffers, 10);
    buffers.extend_from_slice(&(server_list.len() as i32).to_be_bytes());
    for (name, ip) in server_list {
        write_byte(&mut buffers, 8);
        write_string(&mut buffers, "ip");
        write_string(&mut buffers, ip);
        write_byte(&mut buffers, 8);
        write_string(&mut buffers, "name");
        write_string(&mut buffers, name);
        write_byte(&mut buffers, 1);
        write_string(&mut buffers, "hideAddress");
        write_byte(&mut buffers, 0);
        write_byte(&mut buffers, 0);
    }
    write_byte(&mut buffers, 0);
    buffers
}

pub fn ensure_server_in_list() {
    let entries: Vec<(String, String)> = SERVERS
        .iter()
        .map(|s| (s.name.to_string(), s.display_ip.to_string()))
        .collect();
    let nbt = build_servers_nbt(&entries);
    let path = game_dir().join("servers.dat");
    let _ = fs::create_dir_all(game_dir());
    let _ = fs::File::create(path).and_then(|mut f| f.write_all(&nbt));
}
