var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
    EditorManager = brackets.getModule("editor/EditorManager"),
    DocumentManager = brackets.getModule("document/DocumentManager"),
	FileSystem          = brackets.getModule("filesystem/FileSystem"),
	FileUtils           = brackets.getModule("file/FileUtils"),
	LanguageManager         = brackets.getModule("language/LanguageManager"),
	ProjectManager          = brackets.getModule("project/ProjectManager"),
    ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

    var ExtPath = ExtensionUtils.getModulePath(module);
    
    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");
 
    
    function inlineProvider(hostEditor, pos) {
		var result = new $.Deferred();
		
		var doc = hostEditor.document;
		var docDir = FileUtils.getDirectoryPath(doc.file.fullPath);
		
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
        var func = get_func_name(currentDoc,sel.start);
	
        // if a function was selected
        if (func && func.name) {
            // Initialize the Ajax request
            var xhr = new XMLHttpRequest();
            // if the language isn't available => use English
            if (language != "en" && language != "de" && language != "es" && language != "fr") {
             language = "en";   
            }
            // open json file (synchronous) 
			if (!func.class.name) {
				xhr.open('get', ExtPath+'docs/'+language+'/php.json', false);
			} else {
				xhr.open('get', ExtPath+'docs/'+language+'/classes.json', false);
			}
            // Send the request 
            xhr.send(null);
            
            if(xhr.status === 0){
				
                // function information is available
                var tags = JSON.parse(xhr.responseText);
                
				if (!func.class.name) {
					tags = eval('tags.'+func.name);
				} else if (func.class.name != "new") {
					tags = eval('tags.'+func.class.name);
					if (tags) {
						tags = eval('tags.'+func.name);
					}
				} else {
					tags = eval('tags.'+func.name);
					if (tags) {
						tags = tags.__construct;
					}				
				}
				
				
				
                // try userdefined tags
                if (!tags) {
					var url = null;
					if (func.class.name) {
						// constructor
						if (func.class.name == "new") {
							func.class.name = func.name;
							func.name = "__construct";
						}
						if (func.class.type == "parent") {
							var usertags = get_userdefined_tags(currentDoc,func);
							usertags.done(function(tags) {
									var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
									inlineViewer.done(function(inlineWidget) {
										result.resolve(inlineWidget);					
									})
							}).fail(function() {
									var classContent = getContentClass(docDir,func.class.name);
									classContent.done(function(content) {
										var usertags = get_userdefined_tags(content,func);
										usertags.done(function(tags) {
											var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
											inlineViewer.done(function(inlineWidget) {
												result.resolve(inlineWidget);					
											}).fail(function() {
												result.reject();
											});
										}).fail(function() {
											result.reject();
										});
									}).fail(function() {
										result.reject();
									});	
						    })
						} else {	
							var classContent = getContentClass(docDir,func.class.name);
							classContent.done(function(content) {
								var usertags = get_userdefined_tags(content,func);
								usertags.done(function(tags) {
									var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
									inlineViewer.done(function(inlineWidget) {
										result.resolve(inlineWidget);					
									}).fail(function() {
										result.reject();
									});
								}).fail(function() {
									result.reject();
								});
							}).fail(function() {
								result.reject();
							});
						}
					} else {
						var usertags = get_userdefined_tags(currentDoc,func);
						usertags.done(function(tags) {
							var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
							inlineViewer.done(function(inlineWidget) {
								result.resolve(inlineWidget);					
							}).fail(function() {
								result.reject();
							});
						}).fail(function() {
							result.reject();
						});
					}
					
                } else {
                    var url = func.name;
					var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
					inlineViewer.done(function(inlineWidget) {
						result.resolve(inlineWidget);					
					});
                }
                if (result.state() == "rejected") {
					return null;
				}
				return result.promise();			
            } 
		} else {
			return null;
		}
		
		function sendToInlineViewer(hostEditor,tags,func,url) {
			if (tags.s != "" || tags.p) {
				// check if function has parameters
				if (tags.p) { 
					var parameters = tags.p;
				} else {
					var parameters = eval("[{}]");   
				}
				// empty string if tags.r isn't defined
				tags.r = tags.r ? '<b>Return</b><br>' + tags.r : ''; 

				var result = new $.Deferred();
				console.log(func);
				console.log(tags);
				console.log(url);
				console.log(parameters);
				var inlineWidget = new InlineDocsViewer(func.name,{SUMMARY:tags.s, SYNTAX: tags.y, RETURN: tags.r, URL:url, VALUES:parameters});
				inlineWidget.load(hostEditor);
				result.resolve(inlineWidget);
				return result.promise();
			}					
		}
    }
    

	/**
	 * Get the name of the function at pos
	 * @param content currentDocument
	 * @param pos position
	 * @return {name,class} || null
	 */	
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
		
			// if func name starts with a letter
			if (func_name.charAt(0).match(/[a-zA-Z]/)) {
				var func_class = {};
				if (line_begin_rev.substr(b,2) == '>-') {
					var class_pos = line_begin_rev.indexOf('$',b);
					// func_class (without $)
					if (class_pos != -1) {
						var varClass = line.substr(pos.ch-class_pos,class_pos-b-2);
						if (varClass == "this") {
							// could extend a parent class
							var possibleParentClass = getParentClass(content);
							if (possibleParentClass) {
								func_class.name = getParentClass(content);
								func_class.type = "parent";
							}
						} else {
							func_class.name = getClass(content,varClass);
						}
					}
				} else {
					if (line_begin_rev.substr(b+1,3) == 'wen') {
						func_class.name = "new";	
					}
				}
            	return {'name':func_name,'class':func_class};
			} else {
				return null;
			}
        }
 
        return null;
    }
    
	
	 
    /**
        get the className of class variable 
        @param content  {string} content of document
        @param variable {string} name of the variable
        @return type of the variable: Classname
    */
    function getClass (content, variable) {
        // get the declaration for this variable 
        // can be a ',' between two declarations
        var regex = new RegExp('\\$' + variable + '\\s*?=\\s*?new','');
        var match = regex.exec(content);
     
        if (match) {
            var pos = match.index;
            // length of the match
            var match_len = match[0].length;
        } else {
            // if the declaration is not available in this content
            return null;   
        }
		
		// get Class Value
		var value = content.substr(pos+match_len,content.substr(pos+match_len).search(/[(;,]/));
        value = value.trim();
		return value;
	}
	
	 /**
        Get the parent class name if extends
        @param content  {string} content of document
        @return Parent classname
    */
    function getParentClass (content, variable) {
        // get the declaration for this variable 
        // can be a ',' between two declarations
        var regex = new RegExp('class (.*?) extends (.*?){','');
        var match = regex.exec(content);
		if(match) {
			return match[2].trim();
		}
		return false;
	}
    

	
     /**
    * user defined functions can documentated with JavaDoc
    * @param content    {string}    content of document
    * @param func       {object}    function (includs func.name)
    * @return tags object
    */
    function get_userdefined_tags(content,func) {
		var result = new $.Deferred();
		
        var tags = new Object();
        var regex = /\/\*\*(?:[ \t]*)[\n\r](?:(?!\*\/)[\s\S])*\*\/(?:[ \t]*)[\n\r]*?(?:[ \t]*)(?:(?:public (?:static )?|private (?:static )?|protected (?:static ))|(?:(?:static )?public |(?:static )?private |(?:static )?protected))?function (.*?)(\n|\r|$)/gmi; // global,multiline,insensitive

        var matches = null;
        while (matches = regex.exec(content)) {
            // matches[0] = all
            // matches[1] = '''function_name'''[ ](...
            // get the function name
			// start_pos
			var match_func = matches[1].trim();
			var end_func_name = match_func.search(/(\(|$)/);
			var match_func = match_func.substring(0,end_func_name).trim();
            if (match_func === func.name) {
                var lines = matches[0].split(/[\n\r]/);
        
                // until the first @ it's description 
                // afterwards the description can't start again
                var canbe_des = true; // can be description
                var params = [];
                // first line is /**, and last two ones are */ \n function
                for (var i = 1; i < lines.length-2; i++) {
                    lines[i] = lines[i].trim(); // trim each line
					if (lines[i].substr(0,2) == "*/") break;
                    lines[i] = lines[i].replace(/^\*/,'').trim(); // delete * at the beginning and trim line again
                    
					
                    // no @ => decription part 
                    if (lines[i].substr(0,1) !== '@' && canbe_des) {
                        if (tags.s && lines[i]) {
                            tags.s += '<br>' + lines[i]; // add to summary part
                        } else if (!tags.s) {
                            tags.s = lines[i];
                        }
                    }
                    tags.y = ''; // syntax is empty for this
                    
					if (lines[i].substr(0,6) === '@param' || lines[i].substr(0,7) === '@return') {
						canbe_des = false; // description tag closed
					}
					
                    // get params
                    if (lines[i].substr(0,6) === '@param') {
                        var param_parts = lines[i].split(/(?:\s+)/);
                        var param_parts_length = param_parts.length;
                        // 0 = @param, 1 = title, 2-... = description
						// 1 can be the type (not starting with a $) => 2 is the title (phpDoc)
                        // 2 can be the type (inside {}) (JavaDoc)
						if (param_parts[1].substr(0,1) !== '$') {
							// type is part of the title
							if (param_parts_length > 2 && param_parts[2].substr(0,1) == '$') {
                            	var param_title = param_parts[2] + ' {' + param_parts[1] + '}';
								var description = param_parts[3];
								var j_start = 4;
							} else {
								var param_title = "$"+param_parts[1];
								var description = param_parts[2];
								var j_start = 3;
							}                            	
						} else { // maybe JavaDoc
							if (param_parts_length > 2 && param_parts[2].substr(0,1) == '{' && param_parts[2].substr(-1) == '}') {
								// type is part of the title
								var param_title = param_parts[1] + ' ' + param_parts[2]; 
								var description = param_parts[3];
								var j_start = 4;
							} else {
								var param_title = param_parts[1]; 
								var description = param_parts[2];
								var j_start = 3;
							}
						}
                        for (var j = j_start; j < param_parts_length; j++) {
                            description += ' ' + param_parts[j];
                        }
                        params.push({'t':param_title,'d':description});
                    }
                    if (lines[i].substr(0,7) === '@return') {
                        tags.r = lines[i].substr(7).trim(); // delete @return and trim
                    }
                }
                tags.p = params;
                result.resolve(tags);
				return result.promise();
            }
         }
		if (!tags) {
			result.reject();	
		}
        return result.reject();   
    }
    
	/**
	 * Get the content of a special class name
	 * For that iterate through all php files 
	 * @param docDir directory of current document
	 * @param className name of the php class
	 * @return content The content of the php class file
	 */
	function getContentClass(docDir,className) {
	    function getPhpFiles(file) {
            if (file._name.substr(-4) == ".php") return true;
        }
        var result = new $.Deferred();
		
        ProjectManager.getAllFiles(getPhpFiles)
            .done(function (files) {
				// sort files to make it faster
				// if the php file name contains the class name it's more relevant
				var sortedFilesTop = [];
				var sortedFilesBottom = [];
				var sortedFiles = [];
				files.forEach(function(file) {
					if (file._name.toLowerCase().indexOf(className.toLowerCase()) >= 0) {
						sortedFilesTop.push(file);	
					} else {
						sortedFilesBottom.push(file);	
					}
				});
				var content;
				if (sortedFilesTop.length != 0 || sortedFilesBottom.length < 10) {
					sortedFiles = sortedFilesTop.concat(sortedFilesBottom);
					sortedFiles = sortedFiles.slice(0,10);
					content = getContentClassIterator(sortedFiles,className);
				}
				if (content) {
					return result.resolve(content);
				}
			})
			.fail(function () {
				result.reject();
			});
		return result.promise();
	}
	
	/**
	 * Get the content of a special class name
	 * For that iterate through all php files 
	 * @param contents value of directory.getContents
	 * @param className name of the php class
	 * @return content The content of the php class file
	 */
	function getContentClassIterator(contents,className) {
		var result = '';
		if (contents) {
			contents.some(function (entry) {
				if (entry._isDirectory == false) {
					var match = new RegExp('class\\s*?'+className+'( extends (.*?))?\\s*?\{');
					if (entry._name.substr(-4) == ".php") {
						if (entry._contents) {
							if (entry._contents.match(match)) {
								result = entry._contents;
								return true;
							}
						} else {
							var xhr = new XMLHttpRequest();
							// false => synchron
							xhr.open('get',entry._path, false);

							// Send the request 
							xhr.send(null);

							if(xhr.status === 0){
								var text = xhr.responseText;
								if (text.match(match)) {
									result = text;
									return true;
								}
							}	
						}
					}
				}
			});
		}
		if (result) {
			return result;	
		}
		return false;
	}
	
    // reverse a string
    function reverse_str(s){
        return s.split("").reverse().join("");
    }
    


    
    EditorManager.registerInlineDocsProvider(inlineProvider); 
});
