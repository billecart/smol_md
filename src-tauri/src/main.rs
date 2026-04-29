#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    smol_md_lib::run();
}
