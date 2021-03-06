/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

var EXPORTED_SYMBOLS = ["phantom"];
Components.utils.import('resource://slimerjs/slConfiguration.jsm');
Components.utils.import('resource://slimerjs/slUtils.jsm');
Components.utils.import('resource://slimerjs/slLauncher.jsm');
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import('resource://slimerjs/slCookiesManager.jsm');
Components.utils.import('resource://slimerjs/slExit.jsm');

const PROXY_TYPE_DIRECT = 0;
const PROXY_TYPE_MANUAL = 1;
const PROXY_TYPE_AUTO_CONFIG = 2;

// Note that "3" is mapped to 0.
// More info here: https://developer.mozilla.org/en-US/docs/Mozilla/Preferences/Mozilla_networking_preferences

const PROXY_TYPE_AUTO_DETECT = 4;
const PROXY_TYPE_SYSTEM = 5;

var libPath = (slConfiguration.scriptFile ? slConfiguration.scriptFile.parent.clone(): null);

var errorHandler;

var defaultSettings = null;

var phantom = {
    /**
     * deprecated
     */
    get args (){
        return slConfiguration.args.slice(1);
    },

    /**
     * deprecated
     */
    get scriptName (){
        return slConfiguration.args[0];
    },

    get page () {
        throw new Error("phantom.page not implemented. Irrelevant for Slimerjs");
    },

    /**
     * get the encoding use for the output on the terminal
     */
    get outputEncoding() {
        return slConfiguration.outputEncoding;
    },

    /**
     * set the encoding use for the output on the terminal.
     * Supports the special value "binary" to output
     * binary content on the standard output stream.
     */
    set outputEncoding(val) {
        slConfiguration.outputEncoding = val;
    },

    // ------------------------  cookies

    /**
     * set a list of cookies for any domain
     * @param cookie[] val
     */
    set cookies (val) {
        slCookiesManager.setCookies(val);
    },

    /**
     * retrieve the list of cookies
     * @return cookie[]
     */
    get cookies () {
        return slCookiesManager.getCookies();
    },

    /**
     * if set to true, cookies will be send in requests
     */
    get cookiesEnabled () {
        return slCookiesManager.isCookiesEnabled();
    },

    set cookiesEnabled(val) {
        slCookiesManager.enableCookies(val);
    },

    /**
     * add a cookie in the cookie jar
     * @param cookie cookie
     * @return boolean true if the cookie has been set
     */
    addCookie : function(cookie) {
        return slCookiesManager.addCookie(cookie);
    },

    /**
     * erase all cookies
     */
    clearCookies : function() {
        slCookiesManager.clearCookies();
    },

    /**
     * delete all cookies that have the given name
     * @param string cookieName  the cookie name
     * @return boolean true if deletion is ok
     */
    deleteCookie : function(cookieName) {
        return slCookiesManager.deleteCookie(cookieName);
    },

    /**
     * return the version of PhantomJS on which this implementation is compatible
     */
    get version() {
        return { major: 1, minor: 9, patch: 8, __exposedProps__ : {major:'r', minor:'r', patch:'r'}};
    },

    get defaultPageSettings () {
        return slConfiguration.getDefaultWebpageConfig();
    },

    /**
     * quit the application.
     *
     * @param integer code the exit code for the shell console. 0 means ok (default value)
     * @phantomcompatibilityissue
     * @internal to resolve the issue, we should provide our own patched xulrunner
     * @fixme in "debug mode", phantomjs does not really exit
     */
    exit : function(code) {
        slExit.exit(code);
    },

    debugExit : function(code) {
        slExit.exit(code);
    },
    
    /**
     * the path where injected script could be find
     * @var string
     */
    get libraryPath () {
        if (!libPath) {
            return "";
        }
        return libPath.path;
    },
    set libraryPath (path) {
        libPath = slUtils.getMozFile(path);
    },

    /**
     * injects an external script into the SlimerJS sandbox runtime
     */
    injectJs: function(filename) {
        if (slConfiguration.mainScriptURI.scheme != 'file') {
            let fileUrl = slConfiguration.mainScriptURI.resolve(filename);
            let source = slUtils.readChromeFile(fileUrl);
            return slLauncher.injectJs(source, fileUrl);
        }

        // resolve the filename against the current working directory
        let f = slUtils.getAbsMozFile(filename, slUtils.workingDirectory);
        if (!f.exists()) {
            // filename resolved against the libraryPath property
            f = slUtils.getAbsMozFile(filename, libPath);
            if (!f.exists()) {
                dump("Error phantom.injectJs: Can't open '"+filename+"'\n");
                return false;
            }
        }
        let source = slUtils.readSyncStringFromFile(f);
        return slLauncher.injectJs(source, Services.io.newFileURI(f).spec);
    },

    /**
     * set the handler for errors
     */
    set onError (val) {
        slLauncher.errorHandler = val;
    },
    /**
     * get the handler for errors
     */
    get onError () {
        return slLauncher.errorHandler;
    },

    get defaultErrorHandler () {
        return slLauncher.defaultErrorHandler;
    },

    get webdriverMode () {
        return (slConfiguration.webdriver != '');
    },

    get aboutToExit () {
        return {
            connect: function(callback) {
                slExit.addCallback(callback);
            },
            disconnect : function(callback) {
                slExit.removeCallback(callback);
            },
            __exposedProps__ : {
                connect : 'r',
                disconnect : 'r'
            }
        }
    },

    /**
     * resolve the given url from the base
     *
     * code from the addons sdk sdk/url.js
     * @param string url
     * @param string base
     * 
     */
    resolveRelativeUrl: function(url, base) {
        try {
            let baseURI = base ? Services.io.newURI(base, null, null) : null;
            return Services.io.newURI(url, null, baseURI).spec;
        }
        catch (e if e.result == Cr.NS_ERROR_MALFORMED_URI) {
            throw new Error("malformed URI: " + url);
        }
        catch (e if (e.result == Cr.NS_ERROR_FAILURE ||
                     e.result == Cr.NS_ERROR_ILLEGAL_VALUE)) {
            throw new Error("invalid URI: " + url);
        }
    },

    /**
     * Decode a URL to human-readable form.
     * @param url The URL to be decoded.
     */
    fullyDecodeUrl : function(url) {
        return decodeURI(url);
    },

    proxy: function () {
        var type = Services.prefs.getIntPref('network.proxy.type');

        if (PROXY_TYPE_AUTO_CONFIG == type) {
            return String(Services.prefs.getCharPref('network.proxy.autoconfig_url'));
        }

        if (PROXY_TYPE_MANUAL != type) {
            return null;
        }

        var host = String(Services.prefs.getCharPref('network.proxy.http')).trim();
        var port = String(Services.prefs.getIntPref('network.proxy.http_port')).trim();
        if (!host.length || !port.length) {
            host = String(Services.prefs.getCharPref('network.proxy.socks')).trim();
            port = String(Services.prefs.getIntPref('network.proxy.socks_port')).trim();
        }
        if (!host.length || !port.length) {
            return null;
        }

        return host + ':' + port;
    },

    setProxy: function (hostOrAutoConfigUrl, port, proxyType, user, password) {
        hostOrAutoConfigUrl = hostOrAutoConfigUrl ? String(hostOrAutoConfigUrl).trim() : '';

        if (!hostOrAutoConfigUrl.length) {
            Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_DIRECT);
        }

        slConfiguration.proxyAuthUser = user;
        slConfiguration.proxyAuthPassword = password;

        switch (proxyType) {
            case 'system':
                Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_SYSTEM);
                break;
            case 'auto':
                Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_AUTO_DETECT);
                break;
            case 'config-url':
                var autoConfigUrl = hostOrAutoConfigUrl;

                if (autoConfigUrl.startsWith('http://') || autoConfigUrl.startsWith('file://')) {
                    Services.prefs.setCharPref('network.proxy.autoconfig_url', autoConfigUrl);
                    Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_AUTO_CONFIG);
                }
                break;
            case 'socks5':
            case 'socks':
                var host = hostOrAutoConfigUrl;

                Services.prefs.setCharPref('network.proxy.socks', host);
                Services.prefs.setIntPref('network.proxy.socks_port', port);
                Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_MANUAL);

                // Reset http proxy:

                Services.prefs.setCharPref('network.proxy.http', '');
                Services.prefs.setIntPref('network.proxy.http_port', null);
                break;
            case 'http':
            case null:
            case undefined:
                var host = hostOrAutoConfigUrl;

                Services.prefs.setCharPref('network.proxy.http', host);
                Services.prefs.setIntPref('network.proxy.http_port', port);
                Services.prefs.setCharPref('network.proxy.ssl', host);
                Services.prefs.setIntPref('network.proxy.ssl_port', port);
                Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_MANUAL);

                // Reset socks proxy:

                Services.prefs.setCharPref('network.proxy.socks', '');
                Services.prefs.setIntPref('network.proxy.socks_port', null);
                break;
            default:
                Services.prefs.setIntPref('network.proxy.type', PROXY_TYPE_DIRECT);
        }
    },

    __exposedProps__ : {
        cookies: 'rw',
        cookiesEnabled: 'rw',
        libraryPath : 'rw',
        version : 'r',
        addCookie : 'r',
        clearCookies : 'r',
        deleteCookie : 'r',
        exit : 'r',
        page : 'r',
        injectJs : 'r',
        onError : 'rw',
        defaultErrorHandler : 'r',
        defaultPageSettings : 'r',
        webdriverMode: 'r',
        outputEncoding: 'rw',
        aboutToExit : 'r',
        resolveRelativeUrl: 'r',
        fullyDecodeUrl: 'r'
    }
}

