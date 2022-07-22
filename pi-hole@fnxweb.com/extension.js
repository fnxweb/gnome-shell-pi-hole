// Import
const { Atk, Gio, GLib, GObject, Gtk, Soup, St } = imports.gi;
const { main, panelMenu, popupMenu } = imports.ui;
const ExtensionUtils = imports.misc.extensionUtils
const Mainloop = imports.mainloop;

const IndicatorName = 'pi-hole';


// Common
const PiHoleExtMetadata = ExtensionUtils.getCurrentExtension();
const Common = PiHoleExtMetadata.imports.common;
const Gettext = imports.gettext.domain( PiHoleExtMetadata.metadata['gettext-domain'] );
const _ = Gettext.gettext;
let PiHoleExtButton = null;


// Implement PiHole class
const PiHole = GObject.registerClass(
class PiHole extends panelMenu.Button
{
    // ctor
    _init ()
    {
        // Core setup
        super._init( null, IndicatorName );
        ExtensionUtils.initTranslations();
        this.Name = IndicatorName;

        // Debug
        this.Debug= false;

        // Status URL
        this.Url= '';

        // API key
        this.ApiKey = '';

        // Timer period (seconds)
        this.UpdateTime = 0;

        // Disable duration (seconds)
        this.DisableTime = 0;

        // Updates
        this.StatusEvent= null;

        // Current status
        this.StatusField= null;
        this.IconStatus= "";
        this.Status= "unknown";

        // Buttons
        this.Icon= null;
        this.PauseButton= null;
        this.EnableDisableButton= null;
        this.SettingsButton= null;

        // Watch settings
        this.SettingChangedHandlerIds= null;

        // Settings
        this.Settings = ExtensionUtils.getSettings();
        this.Url = this.Settings.get_string( Common.URL_SETTING );
        this.ApiKey = this.Settings.get_string( Common.API_KEY_SETTING );
        this.UpdateTime = this.Settings.get_uint( Common.UPDATE_RATE_SETTING );
        if (this.UpdateTime < 5)
            this.UpdateTime = 5;
        this.DisableTime = this.Settings.get_uint( Common.DISABLE_TIME_SETTING );
        if (this.DisableTime < 1)
            this.DisableTime = 1;

        // Diag
        if (this.Debug)
        {
            this.dprint("Url: " + this.Url);
            this.dprint("ApiKey: " + this.ApiKey);
            this.dprint("UpdateTime: " + this.UpdateTime.toString());
            this.dprint("DisableTime: " + this.DisableTime.toString());
        }

        // Create a Soup session with which to do requests
        this.SoupSession = new Soup.SessionAsync();
        if (Soup.Session.prototype.add_feature != null)
            Soup.Session.prototype.add_feature.call(this.SoupSession, new Soup.ProxyResolverDefault());

        // Create button/icon
        this.Icon = new St.Icon({ style_class: 'system-status-icon' });
        this.add_child( this.Icon );
        this.setIcon();


        // Prep. menu
        if (main.panel._menus == undefined)
            main.panel.menuManager.addMenu(this.menu);
        else
            main.panel._menus.addMenu(this.menu);


        // Add status popup

        // .. status
        this.StatusField = new St.Label({style_class:'stage popup-menu pihole-label', text:""});
        this.setStatusText();
        this.addMenuItem( this.StatusField );

        // .. sep
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        // .. control buttons        
        this.PauseButton = new popupMenu.PopupMenuItem(_("Pause temporarily"), {style_class:"pihole-indent"});
        this.PauseButton.connect('activate', () => {
            this.onPauseButton();
            return 0;
        });
        this.menu.addMenuItem(this.PauseButton);
        //
        this.EnableDisableButton = new popupMenu.PopupMenuItem(_("Disable"), {style_class:"pihole-indent"});
        this.EnableDisableButton.connect('activate', () => {
            this.onEnableDisableButton();
            return 0;
        });
        this.menu.addMenuItem(this.EnableDisableButton);

        // .. sep
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        // .. settings
        this.SettingsButton = new popupMenu.PopupMenuItem(_("Settings"), {style_class:"pihole-indent"});
        this.SettingsButton.connect('activate', () => {
            this.onSettingsButton();
            return 0;
        });
        this.menu.addMenuItem(this.SettingsButton);

        // Get initial status (starts timer for next)
        this.getPiHoleStatus();

        // Watch for settings changes
        this.SettingChangedHandlerIds = [
            this.Settings.connect("changed::" + Common.URL_SETTING, () => {
                PiHoleExtButton.Url = this.Settings.get_string( Common.URL_SETTING );
            }),
            this.Settings.connect("changed::" + Common.API_KEY_SETTING, () => {
                PiHoleExtButton.ApiKey = this.Settings.get_string( Common.API_KEY_SETTING);
            }),
            this.Settings.connect("changed::" + Common.UPDATE_RATE_SETTING, () => {
                PiHoleExtButton.UpdateTime = this.Settings.get_uint( Common.UPDATE_RATE_SETTING );
            }),
            this.Settings.connect("changed::" + Common.DISABLE_TIME_SETTING, () => {
                PiHoleExtButton.DisableTime = this.Settings.get_uint( Common.DISABLE_TIME_SETTING );
            })
        ];
    }


    // Debug
    dprint(msg)
    {
        if (this.Debug)
            print("PiHole: " + msg);
    }


    // Error
    eprint(msg)
    {
        global.log("PiHole: " + msg);
    }


    // Add an item to the “menu”
    addMenuItem(item)
    {
        let menuitem = new popupMenu.PopupBaseMenuItem({ reactive:false });
        menuitem.actor.add_actor( item );
        this.menu.addMenuItem( menuitem );
    }


    // Set correct icon
    setIcon()
    {
        if (this.Status == this.IconStatus)
            return;

        this.IconStatus = this.Status;
        if (this.IconStatus == "enabled")
            this.Icon.set_gicon( this.getCustomIcon('pi-hole-symbolic') );
        else if (this.IconStatus == "disabled")
            this.Icon.set_gicon( this.getCustomIcon('pi-hole-disabled-symbolic') );
        else
            this.Icon.set_gicon( this.getCustomIcon('pi-hole-unknown-symbolic') );
    }


    // Get custom icon from theme or file
    getCustomIcon(icon_name)
    {
        let icon_path = PiHoleExtMetadata.dir.get_child('icons').get_child( icon_name + ".svg" ).get_path();
        let theme = Gtk.IconTheme.get_default();
        if (theme)
        {
            let theme_icon = theme.lookup_icon( icon_name, -1, 2 );
            if (theme_icon)
               icon_path = theme_icon.get_filename();
        }
        this.dprint("setting new icon from " + icon_path);
        return Gio.FileIcon.new( Gio.File.new_for_path( icon_path ) );
    }


    // Request pi-hole status
    getPiHoleStatus()
    {
        this.dprint("getting pi-hole status");
        try
        {
            // Trigger request
            let me = this;
            let url = this.Url + "/api.php?status&auth=" + this.ApiKey;
            let request = Soup.Message.new('GET', url);
            this.SoupSession.queue_message(request, function(soup, message) {
                if (message.status_code == 200)
                {
                    me.processPiHoleStatus(request.response_body.data);
                }
                else
                {
                    me.eprint("error retrieving status: " + message.status_code);
                    me.newPiHoleStatus("unknown");
                }
            });

            // Now do it again in a bit
            this.StatusEvent = GLib.timeout_add_seconds(0, this.UpdateTime, () => {
                this.getPiHoleStatus();
                return 0;
            });
        }
        catch (err)
        {
            this.eprint("exception requesting status: " + err);
        }
    }


    // Pause pi-hole
    onPauseButton()
    {
        // Do op
        this.dprint("pausing pi-hole");
        this.enableDisable( "disable=" + this.DisableTime.toString() );

        // Now ask for status again a second after it should be re-enabled
        Mainloop.source_remove(PiHoleExtButton.StatusEvent);
        this.StatusEvent = GLib.timeout_add_seconds(0, this.DisableTime + 1, () => {
            this.getPiHoleStatus();
            return 0;
        });
    }


    // Enable or disable pi-hole
    onEnableDisableButton()
    {
        // Do correct op
        let op;
        if (this.Status == "enabled")
        {
            this.dprint("disabling pi-hole (currently " + this.Status + ")");
            op = "disable";
        }
        else
        {
            this.dprint("enabling pi-hole (currently " + this.Status + ")");
            op = "enable";
        }
        this.enableDisable( op );

        // Restart status request cycle since we just got an up-to-date status
        Mainloop.source_remove(PiHoleExtButton.StatusEvent);
        this.StatusEvent = GLib.timeout_add_seconds(0, this.UpdateTime, () => {
            this.getPiHoleStatus();
            return 0;
        });
    }


    // Enable or disable pi-hole given op
    enableDisable( op )
    {
        this.dprint("requesting " + op);
        try
        {
            // Trigger request
            let me = this;
            let url = this.Url + "/api.php?" + op + "&auth=" + this.ApiKey;
            let request = Soup.Message.new('GET', url);
            this.SoupSession.queue_message(request, function(soup, message) {
                if (message.status_code == 200)
                {
                    me.processPiHoleStatus(request.response_body.data);
                }
                else
                {
                    me.eprint("error requesting disable: " + message.status_code);
                    me.newPiHoleStatus("unknown");
                }
            });
        }
        catch (err)
        {
            this.eprint("exception requesting enable/disable: " + err);
            this.newPiHoleStatus("unknown");
        }
    }


    // Handle status
    processPiHoleStatus(data)
    {
        this.dprint("processing status");

        // Process JSON response status
        this.Status = "unknown";
        try
        {
            // Process results string
            var obj = JSON.parse( data.toString() );
            this.newPiHoleStatus( obj.status );
        }
        catch (err)
        {
            this.eprint("exception processing status [" + data.toString() + "]: " + err);
            this.newPiHoleStatus("unknown");
        }
    }


    // New status
    newPiHoleStatus(newstatus)
    {
        if (newstatus === undefined)
            newstatus = "undefined";
        this.Status = newstatus;

        // Update statuses
        this.dprint("got status " + this.Status);
        this.setStatusText();
        this.setIcon();
        if (this.Status == "enabled")
            this.EnableDisableButton.label.set_text(_("Disable"));
        else
            this.EnableDisableButton.label.set_text(_("Enable"));
    }


    // Status text
    setStatusText()
    {
        let clutter_text = this.StatusField.get_clutter_text();
        clutter_text.set_markup( _("Pi-Hole Status") + ":  <b>" + this.Status + "</b>" );
    }


    // Open settings
    onSettingsButton()
    {
        ExtensionUtils.openPrefs();
    }
});


// Setup
function init()
{
}


// Turn on
function enable()
{
    PiHoleExtButton = new PiHole();
    main.panel.addToStatusArea( IndicatorName, PiHoleExtButton );
}


// Turn off
function disable()
{
    // Disconnects the setting listeners
    for (let id in this.SettingChangedHandlerIds)
        this._settings.disconnect(this.SettingChangedHandlerIds[id]);
    this.SettingChangedHandlerIds = null;

    // Finish off
    Mainloop.source_remove(PiHoleExtButton.StatusEvent);
    PiHoleExtButton.destroy();
    PiHoleExtButton = null;
}
