// Prefs widget

//const Gio = imports.gi.Gio;
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
    // Create
    let prefs = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, border_width: 8, margin: 8 });
    prefs.set_spacing(4);

    // Settings
    {
        let widget = new Gtk.Entry({ width_chars: 50, tooltip_text: "URL of pi-hole admin page for API access" });
        widget.set_text( settings.get_string( Common.URL_SETTING ) );
        widget.connect( 'changed', function() {
            settings.set_string( Common.URL_SETTING, widget.get_text() );
        });
        _addSetting( prefs, "Pi-Hole URL", widget );
    }

    {
        let widget = new Gtk.Entry({ width_chars: 50, tooltip_text: "API key of pi-hole from settings/api page" });
        widget.set_text( settings.get_string( Common.API_KEY_SETTING ) );
        widget.connect( 'changed', function() {
            settings.set_string( Common.API_KEY_SETTING, widget.get_text() );
        });
        _addSetting( prefs, "API key", widget );
    }

    {
        let widget = new Gtk.SpinButton({ tooltip_text: "Rate at which Pi-Hole is normally polled for its status" });
        widget.set_range( 1, 900 );
        widget.set_increments( 1, 5 );
        widget.set_value( settings.get_uint( Common.UPDATE_RATE_SETTING ) );
        widget.connect( 'value-changed', function() {
            settings.set_uint( Common.UPDATE_RATE_SETTING, widget.get_value() );
        });
        _addSetting( prefs, "Update rate (seconds)", widget );
    }

    {
        let widget = new Gtk.SpinButton({ tooltip_text: "How long to pause Pi-Hole for when it is paused" });
        widget.set_range( 1, 900 );
        widget.set_increments( 1, 5 );
        widget.set_value( settings.get_uint( Common.DISABLE_TIME_SETTING ) );
        widget.connect( 'value-changed', function() {
            settings.set_uint( Common.DISABLE_TIME_SETTING, widget.get_value() );
        });
        _addSetting( prefs, "Pause time (seconds)", widget );
    }

    // Done
    prefs.show_all();
    return prefs;
}


// Add a labelled setting
function _addSetting( prefs, labeltext, widget )
{
    let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
    let label = new Gtk.Label({ label: labeltext, xalign: 0 });

    box.pack_start( label, true, true, 0 );
    box.add( widget );

    prefs.pack_start( box, false, false, 0 );
}
