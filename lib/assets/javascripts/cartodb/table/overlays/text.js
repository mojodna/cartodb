cdb.admin.overlays.Text = cdb.core.View.extend({

  className: "text overlay",

  template_name: 'table/views/overlays/text',

  events: {

    "mouseup":           "_onMouseUp",
    "mousedown":         "_onMouseDown",

    "mouseenter .text":  "_onMouseEnter",
    "mouseleave .text":  "_onMouseLeave",

    "click .close":      "_close",
    "click .content":    "_click",
    "dblclick .content": "_dblClick",

    "keyup .text":       "_onKeyUp",
    "click .text":       "_killEvent",
    "paste .text":       "_onPaste"

  },

  initialize: function() {

    _.bindAll(this, "_click", "_close", "_dblClick", "_onChangeMode", "_onKeyDown", "_putOnTop");

    // Bind ESC key
    $(document).bind('keydown', this._onKeyDown);

    this.template = this.getTemplate(this.template_name);

    this._setupModels();

  },

  _killEvent: function(e) {

    e && e.preventDefault();
    e && e.stopPropagation();

  },

  // Setup the internal and custom model
  _setupModels: function() {

    var self  = this;
    var extra = this.model.get("extra");

    this.model.set({ text: extra.text }, { silent: true });

    var applyStyle = function() {
      self._applyStyle(true);
    };

    // Binding
    this.model.bind('change:style',   applyStyle,            this);
    this.model.bind('change:text',    this._setText,         this);
    this.model.bind('change:display', this._onChangeDisplay, this);
    this.model.bind('change:extra',   this._onChangeExtra,   this);

    // Internal model to store the editing state
    this.editModel = new cdb.core.Model({ mode: "" });
    this.editModel.bind('change:mode', this._onChangeMode, this);

    this.add_related_model(this.editModel);

  },

  // Element events 
  _onKeyUp: function(e) {

    var self = this;

    var temp      = "";
    var domString = "";

    if (this.timeout)       clearTimeout(this.timeout);
    if (this.keyUpTimeout)  clearTimeout(this.keyUpTimeout);
    if (this.savingTimeout) clearTimeout(this.savingTimeout);

    var value = this.$text.html();

    if (cdb.Utils.stripHTML(value) == "") {

      this.keyUpTimeout = setTimeout(function() {

        self.model.set({ text: "" }, { silent: true });
        self._close();

      }, 600);

    } else {

      this.model.set({ text: value }, { silent: true });

      if (!this.$el.hasClass("hover") && this.$text.text()) {
        this.savingTimeout = setTimeout(function() {

          self._disableEditingMode();

        }, 500);
      }
    }

  },

  _dblClick: function(e) {

    this._killEvent(e);

  },

  _click: function(e) {

    this._killEvent(e);

    this._putOnTop();

    var isLink = e.target.hasAttribute("href");

    if (!isLink) {
      cdb.god.trigger("closeDialogs");
    }

  },

  _onKeyDown: function(e) {

    if (e.keyCode === 27) {
      this.editModel.set("mode", "");
    }

  },

  _onPaste: function(e) {

    var self = this;

    setTimeout(function() {

      var text = cdb.Utils.stripHTML(self.model.get("text"));
      self.model.set("text", text)

    }, 200);

  },

  _onMouseUp: function(e) {

    // Prevents entering in the edit mode when clicking the edit button
    if (!$(e.target).parents(".overlay_text").length && !$(e.target).hasClass("overlay_text")) {
      this._savePosition(false);
      return;
    }

    cdb.god.trigger("closeDialogs");

    this._savePosition(true);

  },

  _savePosition: function(editable) {

    var extra = this.model.get("extra");

    var x     = this.model.get("x");
    var y     = this.model.get("y");

    var oldX  = this.$el.position().left;
    var oldY  = this.$el.position().top;

    var portrait_direction  = extra.portrait_dominant_side;
    var landscape_direction = extra.landscape_dominant_side;

    if (y == 0 && portrait_dominant_side == "bottom") oldY = y;
    if (x == 0 && landscape_dominant_side == "right") oldX = x;

    if (editable) {
      // If we didn't move the overlay
      if (oldX === x && y === oldY || x == 0 && landscape_dominant_side == "right" && y === oldY || y == 0 && portrait_dominant_side == "bottom" && oldX === x) {

        this.dropdown.hide();
        this.editModel.set("mode", "editable");

        return;

      }
    }

    var x = this.$el.position().left;
    var y = this.$el.position().top;

    var width  = this.$el.width();
    var height = this.$el.height();

    var right  = $(".cartodb-map").width()  - x;
    var bottom = $(".cartodb-map").height() - y;

    var right_position          = right  - width;
    var bottom_position         = bottom - height;

    var map_width               = $(".cartodb-map").width();
    var map_height              = $(".cartodb-map").width();

    var left_percentage         = (x + (width/2))  / map_width  * 100;
    var top_percentage          = (y + (height/2)) / map_height * 100;

    var landscape_dominant_side = x <= right_position ? "left" : "right";
    var portrait_dominant_side  = y <= bottom_position ? "top" : "bottom";

    // Default positions
    extra.default_position        = false;
    extra.landscape_dominant_side = landscape_dominant_side;
    extra.portrait_dominant_side  = portrait_dominant_side;
    extra.top_percentage          = top_percentage;
    extra.left_percentage         = left_percentage;
    extra.right_position          = right_position;
    extra.bottom_position         = bottom_position;
    extra.right                   = right;
    extra.bottom                  = bottom;
    extra.width                   = width;
    extra.height                  = height;

    this.model.set({ extra: extra }, { silent: true});
    this.model.set({ x: x, y: y });

    this.model.save();

  },

  _onMouseDown: function() { },

  _onMouseEnter: function() {

    this.$el.addClass("hover");
    if (this.editModel.get("mode") == "editable") {
      if (this.timeout) clearTimeout(this.timeout);
    }

  },

  _onMouseLeave: function() {
    this.$el.removeClass("hover");

    var self = this;

    if (this.editModel.get("mode") == "editable") {

      this.timeout = setTimeout(function() {

        self.editModel.set("mode", "");

      }, 250);
    }

  },

  show: function(animated) {

    this.$el.show();

    if (true) this.$el.addClass('animated bounceIn');

  },

  hide: function(callback) {

    var self = this;

    this.$el
    .removeClass('animated bounceIn')
    .addClass('animated bounceOut');

    callback && callback();

    // Give it some time to complete the animation
    setTimeout(function() {
      self.clean();
    }, 550);

  },

  _close: function(e) {

    this._killEvent(e);

    var self = this;

    this.dropdown.hide();
    this.dropdown.clean();

    this.hide(function() {
      self.trigger("remove", self);
    });

  },

  _onChangeDisplay: function() {

    var display = this.model.get("display");

    if (display) {
      this.show();
    } else {
      this.$el.hide();
    }

  },

  _onChangeExtra: function() {

    var extra  = this.model.get("extra");
    extra.text = this.model.get("text");

    this.model.set({ extra: extra }, { silent: true });

  },

  /*
   * Applies style to the content of the widget
   */

  _applyStyle: function(save) {

    var style      = this.model.get("style");

    var boxColor   = style["box-color"];
    var boxOpacity = style["box-opacity"];
    var boxWidth   = style["box-width"];
    var fontFamily = style["font-family-name"];

    this.$text.css(style);
    this.$text.css("font-size", style["font-size"] + "px");

    var rgbaCol = 'rgba(' + parseInt(boxColor.slice(-6,-4),16)
    + ',' + parseInt(boxColor.slice(-4,-2),16)
    + ',' + parseInt(boxColor.slice(-2),16)
    +', ' + boxOpacity + ' )';

    this.$el.css("background-color", rgbaCol);
    this.$el.css("max-width", boxWidth);

    var fontFamilyClass = "";

    if      (fontFamily  == "Droid Sans") fontFamilyClass = "droid";
    else if (fontFamily  == "Vollkorn")   fontFamilyClass = "vollkorn";
    else if (fontFamily  == "Open Sans")  fontFamilyClass = "open_sans";
    else if (fontFamily  == "Roboto")     fontFamilyClass = "roboto";

    this.$el.css("width", "auto");

    this.$el
    .removeClass("droid")
    .removeClass("vollkorn")
    .removeClass("roboto")
    .removeClass("open_sans");

    this.$el.addClass(fontFamilyClass);

    if (save) this.model.save();

  },

  _onChangeMode: function() {

    var mode = this.editModel.get("mode");

    if (mode == "editable") {

      this._enableEditingMode();

    } else {

      this._disableEditingMode();

    }

  },

  _enableEditingMode: function() {

    var text = this.model.get("text");

    this.$el
    .addClass("editable")
    .addClass("disabled");

    this.$text.attr("contenteditable", true).focus();

    this.$el.css("width", "auto");

    var self = this;

    setTimeout(function() {
      self.$text.html(text);
      self.$el.css("max-width", self.$el.width() + 20);
      self.$el.css("width", self.$el.width() + 20);
    }, 100)

  },

  _disableEditingMode: function() {

    var text = this._transformToMarkdown(this.model.get("text"));

    this.editModel.set("mode", "");

    if (text) {

      this.$text.html(text);

      this.$el
      .removeClass("editable")
      .removeClass("disabled");

      this.$text.attr("contenteditable", false);
      this.$el.css("width", "auto");

      var self = this;

      setTimeout(function() {

        var width = self.$el.width();
        var extra = self.model.get("extra");

        extra.width = width;

        self.model.set({ extra: extra }, { silent: true});
        self.model.save();

        self.$el.css("width", width);

      }, 400);

      this.model.save();

    }

  },

  _setText: function() {

    var text          = this.model.get("text");
    var rendered_text = this._transformToMarkdown(text);

    var extra = this.model.get("extra");

    extra.text          = text;
    extra.rendered_text = rendered_text

    this.model.set({ extra: extra }, { silent: true });

    if (rendered_text) this.$text.html(rendered_text);

  },

  _transformToMarkdown: function(text) {

    text = markdown.toHTML(text)

    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/<p>/g, "");
    text = text.replace(/&amp;nbsp;/g, " ");
    text = text.replace(/<\/p>/g, "");

    return text;

  },

  _addDropdown: function() {

    var device            = this.model.get("device");
    var horizontal_offset = 26;
    var vertical_offset   = 24;

    if (device === "mobile") {
      vertical_offset -= $("header").height() + 12;
    }

    this.dropdown = new cdb.admin.OverlayPropertiesDropdown({
      tick: "left",
      target: this.$el.find(".edit"),
      model: this.model,
      offset_mode: device === 'mobile' ? "offset" : "position",
      horizontal_position: "left",
      horizontal_offset: horizontal_offset,
      vertical_offset: vertical_offset,
      template_base: 'table/views/overlays/properties_dropdown',
      form_data: [{
        name: 'Text Align',
        form: {
          'text-align':      { type: 'text_align', value: 'left' },
        }
      }, {
        name: 'Text Style',
        form: {
          'font-size':  { type: 'simple_number', value: 12, min: 5, max: 50, inc: 2 },
          'color':      { type: 'color', value: '#FFF' },
        }

      }, {
        name: 'Font',
        form: {
          'font-family-name': {
            type: 'select',
            value: "Helvetica",
            extra: ["Helvetica", "Droid Sans", "Vollkorn", "Roboto", "Open Sans"]
          }
        }
      }, {

        name: 'Box Style',
        form: {
          'box-color':  { type: 'color', value: '#000' },
          'box-opacity':  { type: 'simple_opacity', value: .7, min:0, max:1, inc: .1 },
        }

      }, {
        name: 'Max Width',
        form: {
          'box-width':  { type: 'simple_number', value: 300, min: 50, max: 2000, inc: 10 },
        }

      }]
    });

    this._bindDropdown();

    var self = this;

    this.dropdown.on("saved", function() {
      self.dropdown.move();
    });

    if (this.model.get("device") == "mobile") {
      $(".map").append(this.dropdown.render().el);
    } else {
      this.$el.append(this.dropdown.render().el);
    }

  },

  _bindDropdown: function() {

    this.dropdown.bind("onDropdownShown", function() {
      this.$el.addClass("open");

      this._putOnTop();

    }, this);

    this.dropdown.bind("onDropdownHidden", function() {
      this.$el.removeClass("open");
    }, this);

    cdb.god.bind("closeDialogs", this.dropdown.hide, this.dropdown);

  },

  _putOnTop: function() {

    $(".overlay").css("z-index", 999);
    this.$el.css("z-index", 2001);

  },

  _place: function() {

    var extra = this.model.get("extra");

    if (!extra) return;

    var landscape_dominant_side = extra.landscape_dominant_side;
    var portrait_dominant_side  = extra.portrait_dominant_side;

    if (portrait_dominant_side == 'bottom') {

      this.$el.offset({
        bottom: extra.bottom_position
      });

      this.$el.css({
        top: "auto",
        bottom: extra.bottom_position
      });

    } else {

      this.$el.offset({
        top: this.model.get("y"),
        bottom: "auto"
      });

    }

    if (landscape_dominant_side == 'right') {

      this.$el.offset({
        right: extra.right_position
      });

      this.$el.css({
        left: "auto",
        right: extra.right_position
      });

    } else {

      this.$el.offset({
        left: this.model.get("x"),
        right: "auto"
      });

    }

  },

  render: function() {

    this._place();

    this.$el.append(this.template(this.model.attributes));

    this.$text = this.$el.find(".content div.text");
    var text   = this._transformToMarkdown(this.model.get("text"));

    this.$text.html(text);

    this._applyStyle(false);
    this._onChangeExtra();
    this._addDropdown();

    this.$el.addClass(this.model.get("device"));

    return this;

  }

});
