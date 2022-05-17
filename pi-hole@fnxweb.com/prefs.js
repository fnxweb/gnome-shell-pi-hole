// Prefs widget

const ExtensionUtils = imports.misc.extensionUtils;
const Gtk = imports.gi.Gtk;
const Metadata = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain( Metadata.metadata['gettext-domain'] );
const _ = Gettext.gettext;

const Common = Metadata.imports.common;


// Settings instance
let PiHoleSettings = null;


// Prep
function init()
{
    PiHoleSettings = Common.getSettings(Metadata);
    Common.initTranslations(Metadata);
}


// Open
function buildPrefsWidget()
{
    // Create
    let prefs = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 8,
        margin_bottom: 8
    });
    prefs.set_spacing(8);

    // Settings
    {
        let widget = new Gtk.SpinButton({ tooltip_text: _("How long to pause Pi-Hole for when it is paused") });
        widget.set_range( 1, 900 );
        widget.set_increments( 1, 5 );
        widget.set_value( PiHoleSettings.get_uint( Common.DISABLE_TIME_SETTING ) );
        widget.connect( 'value-changed', function() {
            PiHoleSettings.set_uint( Common.DISABLE_TIME_SETTING, widget.get_value() );
        });
        _addSetting( prefs, _("Pause time (seconds)"), widget );
    }

    {
        let widget = new Gtk.SpinButton({ tooltip_text: _("Rate at which Pi-Hole is normally polled for its status") });
        widget.set_range( 1, 900 );
        widget.set_increments( 1, 5 );
        widget.set_value( PiHoleSettings.get_uint( Common.UPDATE_RATE_SETTING ) );
        widget.connect( 'value-changed', function() {
            PiHoleSettings.set_uint( Common.UPDATE_RATE_SETTING, widget.get_value() );
        });
        _addSetting( prefs, _("Update rate (seconds)"), widget );
    }

    {
        let widget = new Gtk.Entry({ width_chars: 50, tooltip_text: _("API key of pi-hole from settings/api page") });
        widget.set_text( PiHoleSettings.get_string( Common.API_KEY_SETTING ) );
        widget.connect( 'changed', function() {
            PiHoleSettings.set_string( Common.API_KEY_SETTING, widget.get_text() );
        });
        _addSetting( prefs, _("API key"), widget );
    }

    {
        let widget = new Gtk.Entry({ width_chars: 50, tooltip_text: _("URL of pi-hole admin page for API access") });
        widget.set_text( PiHoleSettings.get_string( Common.URL_SETTING ) );
        widget.connect( 'changed', function() {
            PiHoleSettings.set_string( Common.URL_SETTING, widget.get_text() );
        });
        _addSetting( prefs, _("Pi-Hole URL"), widget );
    }

    // Done
    return prefs;
}


// Add a labelled setting
function _addSetting( prefs, labeltext, widget )
{
    let box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        margin_start: 8,
        margin_end: 8
    });
    let label = new Gtk.Label({
        label: labeltext,
        xalign: 0,
        halign: Gtk.Align.FILL,
        hexpand: true
    });

    box.append( label );
    box.append( widget );

    prefs.prepend( box );
}
