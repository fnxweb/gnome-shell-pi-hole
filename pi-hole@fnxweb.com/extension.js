// Import
const Atk = imports.gi.Atk;
const ExtensionUtils = imports.misc.extensionUtils
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;

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


// Implement MythTV class
const PiHole = new Lang.Class(
{
    Name    : IndicatorName,
    Extends : PanelMenu.Button,

    // Debug
    Debug: false,

    // Status URL
    Url: '',

    // API key
    ApiKey : '',

    // Timer period (seconds)
    UpdateTime : 0,

    // Disable duration (seconds)
    DisableTime : 0,

    // Updates
    StatusEvent: null,

    // Current status
    StatusField: null,
    IconStatus: "",
    Status: "unknown",

    // Buttons
    Icon: null,
    PauseButton: null,
    EnableDisableButton: null,
    SettingsButton: null,

    // Watch settings
    SettingChangedHandlerIds: null,


    // ctor
    _init : function()
    {
        // Core setup
        this.parent(null, IndicatorName);

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
        if (Main.panel._menus == undefined)
            Main.panel.menuManager.addMenu(this.menu);
        else
            Main.panel._menus.addMenu(this.menu);


        // Add status popup

        // .. status
        let box = new St.BoxLayout({style_class:'pihole-heading-row'});
        let label = new St.Label({style_class:'pihole-label', text:"Pi-Hole Status:  "});
        box.add_actor(label);
        this.StatusField = new St.Label({text:this.Status});
        box.add_actor(this.StatusField);
        this.addMenuItem(box);

        // .. sep
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // .. control buttons        
        this.PauseButton = new PopupMenu.PopupMenuItem("Pause temporarily");
        this.PauseButton.connect('activate', Lang.bind(this, function()  {
            this.onPauseButton();
            return 0;
        }));
        this.menu.addMenuItem(this.PauseButton);
        //
        this.EnableDisableButton = new PopupMenu.PopupMenuItem("Disable");
        this.EnableDisableButton.connect('activate', Lang.bind(this, function()  {
            this.onEnableDisableButton();
            return 0;
        }));
        this.menu.addMenuItem(this.EnableDisableButton);

        // .. sep
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // .. settings
        this.SettingsButton = new PopupMenu.PopupMenuItem("Settings");
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
    },


    // Debug
    dprint: function(msg)
    {
        if (this.Debug)
            print("PiHole: " + msg);
    },


    // Error
    eprint: function(msg)
    {
        global.log("PiHole: " + msg);
    },


    // Add an item to the “menu”
    addMenuItem: function(item)
    {
        let menuitem = new PopupMenu.PopupBaseMenuItem({ reactive:false });
        menuitem.actor.add_actor( item );
        this.menu.addMenuItem( menuitem );
    },


    // Set correct icon
    setIcon: function()
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
    },


    // Get custom icon from theme or file
    getCustomIcon: function(icon_name)
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
    },


    // Request pi-hole status
    getPiHoleStatus: function()
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
    },


    // Pause pi-hole
    onPauseButton: function()
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
    },


    // Enable or disable pi-hole
    onEnableDisableButton: function()
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
    },


    // Enable or disable pi-hole given op
    enableDisable: function( op )
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
    },


    // Handle status
    processPiHoleStatus: function(data)
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
    },


    // New status
    newPiHoleStatus: function(newstatus)
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
    },


    // Open settings
    onSettingsButton: function()
    {
        imports.misc.util.spawn(['gnome-extensions', 'prefs', PiHoleExt.Metadata.uuid]);
    }
})


// Setup
function init()
{
}


// Turn on
function enable()
{
    PiHoleExt.Button = new PiHole();
    Main.panel.addToStatusArea( IndicatorName, PiHoleExt.Button );
}


// Turn off
function disable()
{
    // Disconnects the setting listeners
    for (let id in this.SettingChangedHandlerIds)
        this._settings.disconnect(this.SettingChangedHandlerIds[id]);
    this.SettingChangedHandlerIds = null;

    // Finish off
    Mainloop.source_remove(PiHoleExt.Button.StatusEvent);
    PiHoleExt.Button.destroy();
    PiHoleExt.Button = null;
}
