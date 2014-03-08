var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
    EditorManager = brackets.getModule("editor/EditorManager"),
    DocumentManager = brackets.getModule("document/DocumentManager"),
    ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

    var ExtPath = ExtensionUtils.getModulePath(module);
    
    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");
 
    
    function inlineProvider(hostEditor, pos) {
        // get editor content
        var currentDoc = DocumentManager.getCurrentDocument().getText();
       
        // get programming language
        var langId = hostEditor.getLanguageForSelection().getId();
        
        // Only provide docs when cursor is in php ("clike") content
        if (langId !== "php" && langId !== "clike" ) {
            return null;
        }
        
        // no multiline selection
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }
        
        // get function name
        var func_name = get_func_name(currentDoc,sel.start);
        
        // if a function was selected
        if (func_name) {
            // Initialize the Ajax request
            var xhr = new XMLHttpRequest();
            // if the language isn't available => use English
            if (language != "en" && language != "de" && language != "es" && language != "fr") {
             language = "en";   
            }
            // open json file (synchronous) 
            xhr.open('get', ExtPath+'docs/'+language+'/php.json', false);
            
            // Send the request 
            xhr.send(null);
            
            if(xhr.status === 0){
                // function information is available
                var tags = JSON.parse(xhr.responseText);
                tags = eval('tags.'+func_name);
                
                // try userdefined tags
                if (!tags) {
                  var func = new Object();
                  func.name = func_name;
                  tags = get_userdefined_tags(currentDoc,func);
                  var url = null;
                } else {
                    var url = func_name;
                }
                
                // if the function exists
                if (tags) {
                    if (tags.s != "" || tags.p) {
                        var summary = tags.s;
                        // check if function has parameters
                        if (tags.p) { 
                            var parameters = tags.p;
                        } else {
                            var parameters = eval("[{}]");   
                        }
                        tags.r = tags.r ? '<b>Return</b><br>' + tags.r : ''; // empty string if tags.r isn't defined

                        var result = new $.Deferred();
                        var inlineWidget = new InlineDocsViewer(func_name,{SUMMARY:summary, RETURN: tags.r, URL:url, VALUES:parameters});
                        inlineWidget.load(hostEditor);
                        result.resolve(inlineWidget);
                        return result.promise();
                    }
                }
            }
        } 
        return null;
    }
    
    function get_func_name(content,pos) {
        // get the content of each line
        var lines = content.split("\n");
        // get the content of the selected line
        var line = lines[pos.line];
        // get string after current position
        var line_after = line.substr(pos.ch);
        // get string before current position
        var line_begin = line.substr(0,pos.ch);
        // reverse the string before current position
        var line_begin_rev = reverse_str(line_begin);
        
        
        // characters which can be part of a function name
        var function_chars = '0123456789abcdefghijklmnopqrstuvwxyz_';
        
        var e = 0;
        while (function_chars.indexOf(line_after.substr(e,1).toLowerCase()) !== -1 && e < line_after.length) {
            e++;
        }
        
        var b = 0;
        while (function_chars.indexOf(line_begin_rev.substr(b,1).toLowerCase()) !== -1 && b < line_begin_rev.length) {
            b++;
        }

        // characters which can't be directly before the function_name
        var no_function_chars = '0123456789$';
        if (no_function_chars.indexOf(line_begin_rev.substr(b,1)) === -1 || b == line_begin_rev.length) {
            var func_name = line.substr(pos.ch-b,b+e);
            return func_name;
        }
 
        return null;
    }
    
    
    /**
    * user defined functions can documentated with JavaDoc
    * @param content    content of document
    * @param func       function (includs func.name)
    * @return tags object
    */
    function get_userdefined_tags(content,func) {
        var tags = new Object();
        var regex = /\/\*\*( *?)\n([\s\S]*?)\*\/( *?)\n( *?)function(.*?)\{/gmi; // global,multiline,insensitive

        var matches = null;
        while (matches = regex.exec(content)) {
            // matches[0] = all
            // matches[1] = whitespace
            // matches[2] = inside /** */ 
            // matches[3] = whitespace before \n
            // matches[4] = whitespace before function
            // macthes[5] = function name
            // get the function name
            var match_func = matches[5].substr(0,matches[5].indexOf('(')).trim();

            if (match_func === func.name) {
                var lines = matches[0].split('\n');
        
                // until the first @ it's description 
                // afterwards the description can't start again
                var canbe_des = true; // can be description
                var params = [];
                // first line is /**, and last two ones are */ \n function
                for (var i = 1; i < lines.length-2; i++) {
                    lines[i] = lines[i].trim(); // trim each line
                    lines[i] = lines[i].replace(/^\*/,'').trim(); // delete * at the beginning and trim line again
                    
                    // no @ => decription part 
                    if (lines[i].substr(0,1) !== '@' && canbe_des) {
                        if (tags.s && lines[i]) {
                            tags.s += ' ' + lines[i]; // add to summary part
                        } else if (!tags.s) {
                            tags.s = lines[i];
                        }
                    }
                    
                    // get params
                    if (lines[i].substr(0,6) === '@param') {
                        canbe_des = false; // description tag closed
                        var param_parts = lines[i].split(/(\s+)/);
                        // 0 = @param, 1 = ' ', 2 = title, 3 = ' ', 4-... = description
                        var description = param_parts[4];
                        for (var j = 5; j < param_parts.length; j++) {
                            description += param_parts[j];
                        }
                        params.push({'t':param_parts[2],'d':description});
                    }
                    if (lines[i].substr(0,7) === '@return') {
                        tags.r = lines[i].substr(7).trim(); // delete @return and trim
                    }
                }
                tags.p = params;
                return tags;
            }
         }
        return null;   
    }
    
    // reverse a string
    function reverse_str(s){
        return s.split("").reverse().join("");
    }
    
    
    
    EditorManager.registerInlineDocsProvider(inlineProvider); 
});