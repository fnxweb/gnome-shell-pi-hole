// Prefs widget

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Metadata = ExtensionUtils.getCurrentExtension();

const Common = Metadata.imports.common;


// Settings instance
let settings;


// Prep
function init()
{
    settings = Common.getSettings(Metadata);
}


// Open
function buildPrefsWidget()
{
    let prefs = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, border_width: 8, margin: 16});
    prefs.set_spacing(4);

    return prefs;
}
