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
    Metadata : null,

    // The button
    Button : null
};


// Implement MythTV class
const PiHole = new Lang.Class(
{
    Name    : IndicatorName,
    Extends : PanelMenu.Button,

    // Debug
    Debug: true,

    // Timer period (seconds)
    UpdateTime : 20,

    // API key
    ApiKey : '',

    // Disable duration (seconds)
    DisableTime : 20,

    // Status URL
    StatusUrl: 'http://pi.hole/admin',
    // $StatusUrl/api.php?disable=$duration&auth=$auth

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


    // ctor
    _init : function()
    {
        this.parent(null, IndicatorName);
        this.actor.accessible_role = Atk.Role.TOGGLE_BUTTON;
        PiHoleExt.Metadata = ExtensionUtils.getCurrentExtension();

        // TEMP read auth from file until settings done
        let auth_file = PiHoleExt.Metadata.path + "/auth";
        if (GLib.file_test(auth_file, GLib.FileTest.EXISTS))
        {
            this.dprint("Found auth file");
            let auth = imports.gi.Shell.get_file_contents_utf8_sync(auth_file).split(/\n/);
            this.ApiKey = auth[0];
        }
        else
        {
            this.dprint("NOT FOUND auth file");
        }
        this.dprint("Using auth '" + this.ApiKey + "'");

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
        // .. buttons        
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

        // Initial status (and starts timer for next)
        this.getPiHoleStatus();
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
            let url = this.StatusUrl + "/api.php?status&auth=" + this.ApiKey;
            let request = Soup.Message.new('GET', url);
            this.SoupSession.queue_message(request, function(soup, message) {
                if (message.status_code == 200)
                    me.processPiHoleStatus(request.response_body.data);
                else
                    me.dprint("error retrieving status: " + message.status_code);
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
            let url = this.StatusUrl + "/api.php?" + op + "&auth=" + this.ApiKey;
            let request = Soup.Message.new('GET', url);
            this.SoupSession.queue_message(request, function(soup, message) {
                if (message.status_code == 200)
                    me.processPiHoleStatus(request.response_body.data);
                else
                    me.dprint("error requesting disable: " + message.status_code);
            });
        }
        catch (err)
        {
            this.eprint("exception requesting enable/disable: " + err);
        }
    },


    // Read status
    processPiHoleStatus: function(data)
    {
        this.dprint("processing status");

        // Process JSON response status
        this.Status = "unknown";
        try
        {
            // Process results string
            var obj = JSON.parse( data.toString() );
            this.Status = obj.status;
        }
        catch (err)
        {
            this.eprint("exception processing status [" + data.toString() + "]: " + err);
        }

        // Update statuses
        this.dprint("got status " + this.Status);
        this.StatusField.set_text( this.Status );
        this.setIcon();
        if (this.Status == "enabled")
            this.EnableDisableButton.label.set_text("Disable");
        else
            this.EnableDisableButton.label.set_text("Enable");
    },
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
    Mainloop.source_remove(PiHoleExt.Button.StatusEvent);
    PiHoleExt.Button.
    PiHoleExt.Button.destroy();
    PiHoleExt.Button = null;
}
