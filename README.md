GNOME Shell Pi-Hole
===================

GNOME Shell extension to report Pi-Hole status.  Licensed under the GPL V3.

### Installation

Download the ZIP file (from the link above), and then install it from the GNOME
*Advanced Settings* application's “Shell Extensions/Install Shell Extension”
function.

Alternatively, unpack **pi-hole<span>@</span>fnxweb.com** as the directory
***~/.local/share/gnome-shell/extensions/pi-hole@fnxweb.com***
alongside any other extensions you have.

Then simply restart gnome-shell with ***<Alt-F2>r***.  You may have to manually
enable the extension via the **advanced-settings** GUI.


### Main functionality

This extension polls your Pi-Hole server periodically (every 20 seconds by
default), and shows the current status via its icon.  Its menu allows you
to temporarily pause (default for 20 seconds), disable or enable the Pi-Hole.

![Screenshot](https://github.com/fnxweb/gnome-shell-pi-hole/raw/master/images/main-menu.png)

This should Just Work™, at least for reporting the current status.

You can specify the pi-hole server's location, the update rate and the pause time in the
extension's settings.

![Screenshot](https://github.com/fnxweb/gnome-shell-pi-hole/raw/master/images/settings.png)

For the pause, enable and disable to work, you *will need to enter the Pi-Hole API key*.
This can be found at http://pi.hole/admin/settings.php?tab=api under **Show API token**.


### Diagnostics

If you have problems, edit **extension.js** and set **Debug** to *true*, then
see what gets reported to the *Errors* tab of the GNOME Shell Looking-Glass, or
to **~/.xsession-errors** (or **journalctl /usr/bin/gnome-shell**).
Don't forget to turn the debug back off later.


© Neil Bird  git@fnxweb.com
