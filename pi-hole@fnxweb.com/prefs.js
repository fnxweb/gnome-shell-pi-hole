// Prefs widget

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Common from './common.js';


// Prefs. window
export default class PiHoleExtensionPreferences extends ExtensionPreferences
{
    // Open
    fillPreferencesWindow(window)
    {
        // Create
        let settings = this.getSettings();
        let prefswindow = new Adw.PreferencesPage();
        let prefs = new Adw.PreferencesGroup();
        prefswindow.add( prefs );

        // Settings
        {
            let widget = new Gtk.Entry({ hexpand: true });
            widget.set_text( settings.get_string( Common.URL_SETTING ) );
            widget.connect( 'changed', function() {
                settings.set_string( Common.URL_SETTING, widget.get_text() );
            });
            this._addSetting( prefs, _("Pi-Hole URL"), _("URL of pi-hole admin page for API access"), widget );
        }

        {
            let widget = new Gtk.Entry({ hexpand: true });
            widget.set_text( settings.get_string( Common.API_KEY_SETTING ) );
            widget.connect( 'changed', function() {
                settings.set_string( Common.API_KEY_SETTING, widget.get_text() );
            });
            this._addSetting( prefs, _("API key"), _("API key of pi-hole from settings/api page"), widget );
        }

        {
            let widget = new Gtk.SpinButton();
            widget.set_range( 1, 900 );
            widget.set_increments( 1, 5 );
            widget.set_value( settings.get_uint( Common.UPDATE_RATE_SETTING ) );
            widget.connect( 'value-changed', function() {
                settings.set_uint( Common.UPDATE_RATE_SETTING, widget.get_value() );
            });
            this._addSetting( prefs, _("Update rate (seconds)"), _("Rate at which Pi-Hole is normally polled for its status"), widget );
        }

        {
            let widget = new Gtk.SpinButton();
            widget.set_range( 1, 900 );
            widget.set_increments( 1, 5 );
            widget.set_value( settings.get_uint( Common.DISABLE_TIME_SETTING ) );
            widget.connect( 'value-changed', function() {
                settings.set_uint( Common.DISABLE_TIME_SETTING, widget.get_value() );
            });
            this._addSetting( prefs, _("Pause time (seconds)"), _("How long to pause Pi-Hole for when it is paused"), widget );
        }

        // Done
        window.add( prefswindow );
    }


    // Add a labelled setting
    _addSetting( prefs, labeltext, subtext, widget )
    {
        let box = new Adw.ActionRow({ title: labeltext, subtitle: subtext });
        box.add_suffix( widget );
        box.activatable_widget = widget;
        prefs.add( box );
    }
}
