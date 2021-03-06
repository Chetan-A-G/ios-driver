/*
 * Copyright 2012-2013 eBay Software Foundation and ios-driver committers
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */

Inspector.logLevel = 4; // 0=none, 1=error, 2=error +warning, 3= error,warning,info   4 = all

function Inspector(selector) {

    this.busy = false;

    this.lock = false;
    this.recorder = new Recorder(this);
    this.log = new Logger(this);
    this.selector = selector;

    this.screenshotPath = $("#screenshot").attr("src");
    this.jsTreeConfig = {
        "core": {
            "animation": 0,
            "load_open": true
        },
        "json_data": {
            "ajax": {
                "url": "tree"
            }
        },
        "themes": {
            "theme": "apple"
        },
        "plugins": ["themes", "json_data", "ui"]
    };

    this.init();
}

Inspector.prototype.reloadData = function () {
    var me = this;
    me.jstree = $(me.selector).jstree(me.jsTreeConfig);
    me.jstree.bind("loaded.jstree", function (event, data) {
        me.onTreeLoaded(event, data);
    });
    me.jstree.bind("hover_node.jstree", function (event, data) {
        me.onNodeMouseOver(event, data);
    });

}
/**
 *
 * @param selector {string} jquery selector of the element that will host the jsTree.
 */
Inspector.prototype.init = function () {
    var me = this;

    this.reloadData();

    $("#mouseOver").mousemove(function (event) {
        me.onMouseMove(event);
    });
    $("#mouseOver").click(function (event) {
        me.onMouseClick(event);
    });

    $(document).keydown(function (e) {

        console.log("keyboardDisplayed" + me.keyboardDisplayed);
        if (me.keyboardDisplayed) {
            // console.log("keyboardDisplayed");
        }
        var ESC_KEY = 27;
        if (e.ctrlKey) {
            me.toggleLock();
        } else if (e.keyCode === ESC_KEY) {
            me.toggleXPath();
        }
    });

    me.toggleXPath(false);

    $('#xpathInput').keyup(function () {
        var xpath = $(this).val();

        try {
            var elements = me.findElementsByXpath2(xpath);
            me.select(elements);
            $('#xpathLog').html("found " + elements.length + " results.");
        } catch (err) {
            me.unselect();
            $('#xpathLog').html("Error: " + err.message);
        }
    });

}

/**
 * select the list of elements.Elements are XML nodes from a xpath query.
 * @param elements
 */
Inspector.prototype.select = function (elements) {
    this.unselect();
    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element.getAttributeNode("ref")) {
            var ref = element.getAttributeNode("ref").nodeValue;
            var node = new NodeFinder(this.root).getNodeByReference(ref);
            this.selectOne(node, elements.length === 1);
        }

    }
}

/**
 * mouse over the object tree.
 * @param e
 * @param data
 */
Inspector.prototype.onNodeMouseOver = function (e, data) {
    if (!this.lock) {
        this.unselect();
        this.selectOne(data, true);
    }
}

/**
 * init all variable when the tree is done loading.
 * @param event
 * @param data
 */
Inspector.prototype.onTreeLoaded = function (event, data) {
    this.root = this.jstree.jstree('get_json')[0];
    this.xml = this.root.metadata.xml;
    this.keyboardDisplayed = this.root.metadata.keyboard;
    var webView = this.extractWebView(this.getRootNode());
    if (webView != null) {
        setHTMLSource(webView.metadata.source);
    } else {
        setHTMLSource(null);
    }
    this.expandTree();
    this.loadXpathContext();

    if (this.recorder.on) {
        $("#screenshot").attr("src", this.screenshotPath + "?time=" + new Date().getTime());
        this.busy = false;
    }
}

/**
 * unselect everything. Highlight on the device, the tree, and the optional details.
 */
Inspector.prototype.unselect = function () {
    $('#details').html("");
    $('#xpathLog').html("");
    this.jstree.jstree('deselect_all');
    this.highlight();
}

/**
 * Select the specified node. Node is a node from jstree.
 * @param node
 * @param displayDetails {boolean} true will display the info in the right column. If more than one
 * node is displayed, the node details will overwrite each other.
 */
Inspector.prototype.selectOne = function (node, displayDetails) {
    var rect;
    var type;
    var ref;
    var name;
    var label;
    var value;
    var l10n;

    if (node.metadata) {// from tree parsing, json node
        rect = node.metadata.rect;
        type = node.metadata.type;
        ref = node.metadata.reference;
        name = node.metadata.name;
        label = node.metadata.label;
        value = node.metadata.value;
        l10n = node.metadata.l10n
    } else {// from listener, jstree node
        rect = node.rslt.obj.data("rect");
        type = node.rslt.obj.data('type');
        ref = node.rslt.obj.data('reference');
        name = node.rslt.obj.data('name');
        label = node.rslt.obj.data('label');
        value = node.rslt.obj.data('value');
        l10n = node.rslt.obj.data('l10n');

    }

    this.jstree.jstree('select_node', '#' + ref);
    var translationFound = (l10n.matches != 0);

    this.highlight(rect.x, rect.y, rect.h, rect.w, translationFound, ref);
    if (displayDetails) {
        this.showDetails(type, ref, name, label, value, rect, l10n);
        this.showActions(type, ref);
    }

}

/**
 * show the info about a node in the right details section.
 * @param type
 * @param ref
 * @param na
 * @param label
 * @param value
 * @param rect
 * @param l10n
 */
Inspector.prototype.showDetails = function (type, ref, na, label, value, rect, l10n) {
    var prettyL10N = "";

    if (l10n) {
        prettyL10N = "<h3>L10N</h3>";
        var matches = l10n.matches;
        prettyL10N += "<p><b>Matches</b>: " + matches + "</p>";

        if (matches > 0) {
            prettyL10N += "<p><b>Key</b>: " + l10n.key + "</p>";
            var langs = l10n.langs;
            for (var name in langs) {
                var result = langs[name];
                for (var a in result) {
                    prettyL10N += "<p><b>" + a + "</b> : " + result[a] + "</p>";
                }

            }
        }

    } else {
        prettyL10N = "no l10n for --" + name + "--";
    }

    $('#details').html("<h3>Details</h3>" + "<p><b>Type</b>: " + type + "</p>"
                           + "<p><b>Reference</b>: " + ref + "</p>" + "<p><b>Name</b>: " + na
                           + "</p>" + "<p><b>Label</b>: " + label + "</p>" + "<p><b>Value</b>: "
                           + value + "</p>" + "<p><b>Rect</b>: x=" + rect.x + ",y=" + rect.y
                           + ",h=" + rect.h + "w=" + rect.w + "</p>" + prettyL10N);

};

/**
 * Highlight an area on the device.
 * @param x
 * @param y
 * @param h
 * @param w
 * @param translationFound
 * @param ref
 */
Inspector.prototype.highlight = function (x, y, h, w, translationFound, ref) {
    if (typeof x != 'undefined') {
        var d = $("<div></div>", {
            "class": "hightlight"
        });
        d.appendTo("#rotationCenter");

        d.css('border', "1px solid red");
        d.css('left', x + realOffsetX + 'px');
        d.css('top', y + realOffsetY + 'px');
        d.css('height', h + 'px');
        d.css('width', w + 'px');
        d.css('position', 'absolute');
        d.css('background-color', 'yellow');
        d.css('z-index', '3');
        d.css('opacity', '0.5');
        d.css('opacity', '0.5');
        d.html("<div  style='opacity: 1;color:red;'>ref:" + ref + "</div>");
        var color;
        if (translationFound) {
            color = "blue";
        } else {
            color = "yellow";
        }
        d.css("background-color", color);

    } else {
        $(".hightlight").remove();
    }

}

Inspector.prototype.showActions = function (type, ref) {
    // check action per type.
    $('#reference').html("<input type='hidden' name='reference' value='" + ref + "'>");
}

Inspector.prototype.getRootNode = function () {
    if (this.root) {
        return this.root;
    } else {
        throw new Error('Cannot access the root node. The tree is not fully loaded');
    }

}
Inspector.prototype.expandTree = function () {
    this.jstree.jstree("open_all");
}

Inspector.prototype.extractWebView = function (node) {
    var type = node.metadata.type;
    if ("UIAWebView" === type) {
        return node;
    } else {
        var children = node.children;
        if (children) {
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                var res = this.extractWebView(child);
                if (res) {
                    return res;
                }
            }
        }

    }
    return null;
}

Inspector.prototype.getTreeAsXMLString = function () {
    if (this.xml) {
        return this.xml;
    } else {
        throw new Error('Cannot get the xml for that tree.The tree is not fully loaded');
    }
};

/**
 * init the xpath search content from the XML raw string.
 */
Inspector.prototype.loadXpathContext = function () {
    var parseXml;

    if (window.DOMParser) {
        parseXml = function (xmlStr) {
            return (new window.DOMParser()).parseFromString(xmlStr, "text/xml");
        };
    } else if ("undefined" !== typeof window.ActiveXObject
        && new window.ActiveXObject("Microsoft.XMLDOM")) {
        parseXml = function (xmlStr) {
            var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = "false";
            xmlDoc.loadXML(xmlStr);
            return xmlDoc;
        };
    } else {
        parseXml = function (xmlStr) {
            return null;
        }
    }
    var xmlObject = parseXml(this.getTreeAsXMLString());
    this.xpathContext = xmlObject.ownerDocument == null
        ? xmlObject.documentElement
        : xmlObject.ownerDocument.documentElement;
}

/**
 * find elements by xpath.
 * @param xpath
 * @return {array} of elements.
 * @throws Error if the xpath is invalid.
 */
Inspector.prototype.findElementsByXpath2 = function (xpath) {
    var res = $(this.xpathContext).xpath(xpath);
    return res;
}

/**
 * mouse move for the device mouse over.
 * @param event
 */
Inspector.prototype.onMouseMove = function (event) {

    if (!this.lock) {
        //var x = event.pageX / scale - realOffsetX;
        //var y = event.pageY / scale - (realOffsetY + 45);
        var parentOffset = $("#mouseOver").offset();
        //or $(this).offset(); if you really just want the current element's offset
        var x = event.pageX - parentOffset.left;
        var y = event.pageY - parentOffset.top;
        x = x / scale;
        y = y / scale;
        //console.log(x + "," + y);
        var finder = new NodeFinder(this.root);
        var node = finder.getNodeByPosition(x, y);
        if (node) {
            this.unselect();
            this.selectOne(node, true);
        } else {
            console.log('couldn t find element at ' + x + ' , ' + y);
        }
    }
}

/**
 * mouse move for the device mouse over.
 * @param event
 */
Inspector.prototype.onMouseClick = function (event) {

    if (this.recorder.on && !this.busy) {
        this.busy = true;
        var parentOffset = $("#mouseOver").offset();
        //or $(this).offset(); if you really just want the current element's offset
        var x = event.pageX - parentOffset.left;
        var y = event.pageY - parentOffset.top;
        x = x / scale;
        y = y / scale;
        console.log(x + "," + y);
        var finder = new NodeFinder(this.root);
        var node = finder.getNodeByPosition(x, y);
        if (node) {
            var xpath = this.findXpathExpression(x, y, node);
            var confirm = this.findElementsByXpath2(xpath);
            if (confirm.length === 1) {
                this.recorder.recordClick(xpath);
                this.recorder.forwardClick(x, y);

            } else {
                error(xpath + " should have a single result.It has " + confirm.length);
            }
        } else {
            warning("couldn't find an element for that click");
        }
    }

}

Inspector.prototype.refineXpathExpression = function (x, y, node, xpath, elements) {
    var o = node.metadata;
    var refined = "(" + xpath + ")";
    for (var i = 1; i <= elements.length; i++) {
        var res = refined + "[" + i + "]";
        var els = this.findElementsByXpath2(res);
        if (els.length == 1) {
            this.log.debug(els[0]);
            var id = els[0].ref;
            if (o.ref === id) {
                return res;
            }
        } else {
            console.log("Error. Expected a single result for " + res + ".Found " + els.length);
        }
    }
    console.log("Cannot refine xpath enough to get a single result.");
};
/**
 * Find the easiest xpath expression for the node located @ x,y.
 * @param x
 * @param y
 * @param node
 * @return {string} the xpath expression.
 */
Inspector.prototype.findXpathExpression = function (x, y, node) {
    var o = node.metadata;
    var xpath = "//" + o.type;
    if (o.name && o.name !== 'null') {
        xpath += "[@name='" + o.name + "']";
    } else if (o.label && o.label !== 'null') {
        xpath += "[@label='" + o.label + "']";
    } else if (o.value && o.value !== 'null') {
        xpath += "[@value='" + o.value + "']";
    } else {
        this.log.debug("no attribute.xpath will be generic.");
    }
    var elements = this.findElementsByXpath2(xpath);
    if (elements.length == 0) {
        this.log.error("Error. The xpath doesn't seem to match anything.");
    } else if (elements.length > 1) {
        this.log.debug("There are several elements matching this xpath expression."
                           + "It is not unique enough");
        return this.refineXpathExpression(x, y, node, xpath, elements);

    } else {
        return xpath;
        this.log.debug("ok. Found an xpath expression unique enough");
    }

}
/**
 * toggle the lock mode for the page. Mouse over are disabled when the page is locked.
 */
Inspector.prototype.toggleLock = function () {
    this.lock = !this.lock;
}

/**
 * toggle the Xpath overlay.
 * @param force
 */
Inspector.prototype.toggleXPath = function (force) {
    var show = false;
    if (typeof force != 'undefined') {
        show = force;
        this.xpathMode = show;
    } else {
        show = !this.xpathMode;
    }

    if (show) {
        this.xpathMode = true;

        $("#xpathHelper").dialog({
                                     resizable: false,
                                     dialogClass: "no-close"
                                 });
        $("#xpathHelper").show();
        $("#xpathInput").focus();
    } else {
        this.xpathMode = false;
        $("#xpathHelper").hide();
        $("#xpathInput").blur();
    }
}

function NodeFinder(rootNode) {

    this.matchScore = -1;
    this.candidate = null;

    this.rootNode = rootNode;

    this._hasCorrectPosition = function (node, x, y) {
        var currentX = node.metadata.rect.x;
        var currentY = node.metadata.rect.y;
        var currentH = node.metadata.rect.h;
        var currentW = node.metadata.rect.w;

        if ((currentX <= x) && (x <= (currentX + currentW))) {
            if ((currentY <= y) && (y <= (currentY + currentH))) {
                return true;
            }
        }
        return false;
    };

    this._assignIfBetterCandidate = function (newNode, x, y) {
        if (this._hasCorrectPosition(newNode, x, y)) {
            var surface = (newNode.metadata.rect.h * newNode.metadata.rect.w);
            if (this.candidate) {
                if (surface < this.matchScore) {
                    this.matchScore = surface;
                    this.candidate = newNode;
                }
            } else {
                this.matchScore = surface;
                this.candidate = newNode;
            }
        }
    };

    this.getNodeByPosition = function (x, y) {
        this._getCandidate(this.rootNode, x, y);
        return this.candidate;
    };

    this.getNodeByReference = function (ref) {
        return this._getNodeByReference(this.rootNode, ref);
    }

    this._getNodeByReference = function (node, ref) {
        var reference = node.metadata.reference;
        if (reference === ref) {
            return node;
        } else {
            if (node.children) {
                for (var i = 0; i < node.children.length; i++) {
                    var child = node.children[i];
                    var correctOne = this._getNodeByReference(child, ref);
                    if (correctOne) {
                        return correctOne;
                    }

                }
            }
        }

    }

    this._getCandidate = function (from, x, y) {
        this._assignIfBetterCandidate(from, x, y);
        if (from.children) {
            for (var i = 0; i < from.children.length; i++) {
                var child = from.children[i];
                this._getCandidate(child, x, y);
            }
        }
    };
}