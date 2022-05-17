// Import
const { Atk, Gio, GLib, GObject, Gtk, Soup, St } = imports.gi;
const { main, panelMenu, popupMenu } = imports.ui;
const ExtensionUtils = imports.misc.extensionUtils
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const IndicatorName = 'pi-hole';


// Global storage
let PiHoleExt = {
    // Extension metadata
    Metadata : ExtensionUtils.getCurrentExtension(),

    // Extension settings
    Settings : null,

    // The button
    Button : null
};


// Common
const Common = PiHoleExt.Metadata.imports.common;
const Gettext = imports.gettext.domain( PiHoleExt.Metadata.metadata['gettext-domain'] );
const _ = Gettext.gettext;


// Implement MythTV class
const PiHole = GObject.registerClass(
class PiHole extends panelMenu.Button
{
    // ctor
    _init ()
    {
        // Core setup
        super._init( null, IndicatorName );
        Common.initTranslations( PiHoleExt.Metadata );

        this.Name    = IndicatorName;
        this.Extends = panelMenu.Button;

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
        let settings = Common.getSettings( PiHoleExt.Metadata );
        this.Url = settings.get_string( Common.URL_SETTING );
        this.ApiKey = settings.get_string( Common.API_KEY_SETTING );
        this.UpdateTime = settings.get_uint( Common.UPDATE_RATE_SETTING );
        if (this.UpdateTime < 5)
            this.UpdateTime = 5;
        this.DisableTime = settings.get_uint( Common.DISABLE_TIME_SETTING );
        if (this.DisableTime < 1)
            this.DisableTime = 1;
        PiHoleExt.Settings = settings;

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
        let box = new St.BoxLayout({style_class:'pihole-heading-row'});
        let label = new St.Label({style_class:'pihole-label', text:_("Pi-Hole Status") + ":  "});
        box.add_actor(label);
        this.StatusField = new St.Label({text:this.Status});
        box.add_actor(this.StatusField);
        this.addMenuItem(box);

        // .. sep
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        // .. control buttons        
        this.PauseButton = new popupMenu.PopupMenuItem(_("Pause temporarily"), {style_class:"pihole-indent"});
        this.PauseButton.connect('activate', Lang.bind(this, function()  {
            this.onPauseButton();
            return 0;
        }));
        this.menu.addMenuItem(this.PauseButton);
        //
        this.EnableDisableButton = new popupMenu.PopupMenuItem(_("Disable"), {style_class:"pihole-indent"});
        this.EnableDisableButton.connect('activate', Lang.bind(this, function()  {
            this.onEnableDisableButton();
            return 0;
        }));
        this.menu.addMenuItem(this.EnableDisableButton);

        // .. sep
        this.menu.addMenuItem(new popupMenu.PopupSeparatorMenuItem());

        // .. settings
        this.SettingsButton = new popupMenu.PopupMenuItem(_("Settings"), {style_class:"pihole-indent"});
        this.SettingsButton.connect('activate', Lang.bind(this, function()  {
            this.onSettingsButton();
            return 0;
        }));
        this.menu.addMenuItem(this.SettingsButton);

        // Get initial status (starts timer for next)
        this.getPiHoleStatus();

        // Watch for settings changes
        this.SettingChangedHandlerIds = [
            PiHoleExt.Settings.connect("changed::" + Common.URL_SETTING, Lang.bind(this, function() {
                PiHoleExt.Button.Url = PiHoleExt.Settings.get_string( Common.URL_SETTING );
            })),
            PiHoleExt.Settings.connect("changed::" + Common.API_KEY_SETTING, Lang.bind(this, function() {
                PiHoleExt.Button.ApiKey = PiHoleExt.Settings.get_string( Common.API_KEY_SETTING);
            })),
            PiHoleExt.Settings.connect("changed::" + Common.UPDATE_RATE_SETTING, Lang.bind(this, function() {
                PiHoleExt.Button.UpdateTime = PiHoleExt.Settings.get_uint( Common.UPDATE_RATE_SETTING );
            })),
            PiHoleExt.Settings.connect("changed::" + Common.DISABLE_TIME_SETTING, Lang.bind(this, function() {
                PiHoleExt.Button.DisableTime = PiHoleExt.Settings.get_uint( Common.DISABLE_TIME_SETTING );
            }))
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
        let icon_path = PiHoleExt.Metadata.dir.get_child('icons').get_child( icon_name + ".svg" ).get_path();
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
            this.StatusEvent = GLib.timeout_add_seconds(0, this.UpdateTime, Lang.bind(this, function()  {
                this.getPiHoleStatus();
                return 0;
            }));
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
        Mainloop.source_remove(PiHoleExt.Button.StatusEvent);
        this.StatusEvent = GLib.timeout_add_seconds(0, this.DisableTime + 1, Lang.bind(this, function()  {
            this.getPiHoleStatus();
            return 0;
        }));
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
        Mainloop.source_remove(PiHoleExt.Button.StatusEvent);
        this.StatusEvent = GLib.timeout_add_seconds(0, this.UpdateTime, Lang.bind(this, function()  {
            this.getPiHoleStatus();
            return 0;
        }));
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
        this.StatusField.set_text( this.Status );
        this.setIcon();
        if (this.Status == "enabled")
            this.EnableDisableButton.label.set_text("Disable");
        else
            this.EnableDisableButton.label.set_text("Enable");
    }


    // Open settings
    onSettingsButton()
    {
        imports.misc.util.spawn(['gnome-extensions', 'prefs', PiHoleExt.Metadata.uuid]);
    }
});


// Setup
function init()
{
}


// Turn on
function enable()
{
    PiHoleExt.Button = new PiHole();
    main.panel.addToStatusArea( IndicatorName, PiHoleExt.Button );
}


// Turn off
function disable()
{
    // Disconnects the setting listeners
    for (let id in this.SettingChangedHandlerIds)
        this._settings.disconnect(this.SettingChangedHandlerIds[id]);
    this.SettingChangedHandlerIds = null;

    // Finish off
    mainloop.source_remove(PiHoleExt.Button.StatusEvent);
    PiHoleExt.Button.destroy();
    PiHoleExt.Button = null;
}
