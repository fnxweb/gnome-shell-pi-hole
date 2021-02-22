// common

// defaults
var DEFAULT_URL = 'http://pi.hole/admin';
var DEFAULT_UPDATE_RATE = 20;
var DEFAULT_DISABLE_TIME = 20;

// settings labels
var URL_SETTING = 'url';
var UPDATE_RATE_SETTING = 'update-rate';
var API_KEY_SETTING = 'api-key';


// Access to settings
function getSettings(extension)
{
    let schema = extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell (and therefore schemas are available
    // in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null))
	schemaSource = GioSSS.new_from_directory(
	    schemaDir.get_path(),
	    GioSSS.get_default(),
	    false );
    else
	schemaSource = GioSSS.get_default();

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
	throw new Error('Schema ' + schema + ' could not be found for extension '
	    + extension.metadata.uuid + '. Please check your installation.');

    return new Gio.Settings({ settings_schema: schemaObj });
}

