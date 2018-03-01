webpackJsonp([0],{

/***/ "+5nH":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
        scene = __webpack_require__("LHV8"),
    sg = scene.render,
    bound = scene.bound,
    log = __webpack_require__("J731"),
    Deps = df.Dependencies,
    parseStreams = __webpack_require__("6gf1"),
    Encoder = __webpack_require__("XVii"),
    Transition = __webpack_require__("Lp/H");

function View(el, width, height) {
  this._el    = null;
  this._model = null;
  this._width   = this.__width = width || 500;
  this._height  = this.__height = height || 300;
  this._bgcolor = null;
  this._cursor  = true; // Set cursor based on hover propset?
  this._autopad = 1;
  this._padding = {top:0, left:0, bottom:0, right:0};
  this._viewport = null;
  this._renderer = null;
  this._handler  = null;
  this._streamer = null; // Targeted update for streaming changes
  this._skipSignals = false; // Batch set signals can skip reevaluation.
  this._changeset = null;
  this._repaint = true; // Full re-render on every re-init
  this._renderers = sg;
  this._io  = null;
  this._api = {}; // Stash streaming data API sandboxes.
}

var prototype = View.prototype;

prototype.model = function(model) {
  if (!arguments.length) return this._model;
  if (this._model !== model) {
    this._model = model;
    this._streamer = new df.Node(model);
    this._streamer._rank = -1;  // HACK: To reduce re-ranking churn.
    this._changeset = df.ChangeSet.create();
    if (this._handler) this._handler.model(model);
  }
  return this;
};

// Sandboxed streaming data API
function streaming(src) {
  var view = this,
      ds = this._model.data(src);
  if (!ds) return log.error('Data source "'+src+'" is not defined.');

  var listener = ds.pipeline()[0],
      streamer = this._streamer,
      api = {};

  // If we have it stashed, don't create a new closure.
  if (this._api[src]) return this._api[src];

  api.insert = function(vals) {
    ds.insert(dl.duplicate(vals));  // Don't pollute the environment
    streamer.addListener(listener);
    view._changeset.data[src] = 1;
    return api;
  };

  api.update = function() {
    streamer.addListener(listener);
    view._changeset.data[src] = 1;
    return (ds.update.apply(ds, arguments), api);
  };

  api.remove = function() {
    streamer.addListener(listener);
    view._changeset.data[src] = 1;
    return (ds.remove.apply(ds, arguments), api);
  };

  api.values = function() { return ds.values(); };

  return (this._api[src] = api);
}

prototype.data = function(data) {
  var v = this;
  if (!arguments.length) return v._model.values();
  else if (dl.isString(data)) return streaming.call(v, data);
  else if (dl.isObject(data)) {
    dl.keys(data).forEach(function(k) {
      var api = streaming.call(v, k);
      data[k](api);
    });
  }
  return this;
};

var VIEW_SIGNALS = dl.toMap(['width', 'height', 'padding']);

prototype.signal = function(name, value, skip) {
  var m = this._model,
      key, values;

  // Getter. Returns the value for the specified signal, or
  // returns all signal values.
  if (!arguments.length) {
    return m.values(Deps.SIGNALS);
  } else if (arguments.length === 1 && dl.isString(name)) {
    return m.values(Deps.SIGNALS, name);
  }

  // Setter. Can be done in batch or individually. In either case,
  // the final argument determines if set signals should be skipped.
  if (dl.isObject(name)) {
    values = name;
    skip = value;
  } else {
    values = {};
    values[name] = value;
  }
  for (key in values) {
    if (VIEW_SIGNALS[key]) {
      this[key](values[key]);
    } else {
      setSignal.call(this, key, values[key]);
    }
  }
  return (this._skipSignals = skip, this);
};

function setSignal(name, value) {
  var cs = this._changeset,
      sg = this._model.signal(name);
  if (!sg) return log.error('Signal "'+name+'" is not defined.');

  this._streamer.addListener(sg.value(value));
  cs.signals[name] = 1;
  cs.reflow = true;
}

prototype.width = function(width) {
  if (!arguments.length) return this.__width;
  if (this.__width !== width) {
    this._width = this.__width = width;
    this.model().width(width);
    this.initialize();
    if (this._strict) this._autopad = 1;
    setSignal.call(this, 'width', width);
  }
  return this;
};

prototype.height = function(height) {
  if (!arguments.length) return this.__height;
  if (this.__height !== height) {
    this._height = this.__height = height;
    this.model().height(height);
    this.initialize();
    if (this._strict) this._autopad = 1;
    setSignal.call(this, 'height', height);
  }
  return this;
};

prototype.background = function(bgcolor) {
  if (!arguments.length) return this._bgcolor;
  if (this._bgcolor !== bgcolor) {
    this._bgcolor = bgcolor;
    this.initialize();
  }
  return this;
};

prototype.padding = function(pad) {
  if (!arguments.length) return this._padding;
  if (this._padding !== pad) {
    if (dl.isString(pad)) {
      this._autopad = 1;
      this._padding = {top:0, left:0, bottom:0, right:0};
      this._strict = (pad === 'strict');
    } else {
      this._autopad = 0;
      this._padding = pad;
      this._strict = false;
    }
    if (this._renderer) this._renderer.resize(this._width, this._height, this._padding);
    if (this._handler)  this._handler.padding(this._padding);
    setSignal.call(this, 'padding', this._padding);
  }
  return (this._repaint = true, this);
};

function viewBounds() {
  var s = this.model().scene(),
      legends = s.items[0].legendItems,
      i = 0, len = legends.length,
      b, lb;

  // For strict padding, clip legend height to prevent a tiny data rectangle.
  if (this._strict) {
    b = bound.mark(s, null, false);
    for (; i<len; ++i) {
      lb = legends[i].bounds;
      b.add(lb.x1, 0).add(lb.x2, 0);
    }
    return b;
  }

  return s.bounds;
}

prototype.autopad = function(opt) {
  if (this._autopad < 1) return this;
  else this._autopad = 0;

  var b = viewBounds.call(this),
      pad = this._padding,
      config = this.model().config(),
      inset = config.autopadInset,
      l = b.x1 < 0 ? Math.ceil(-b.x1) + inset : 0,
      t = b.y1 < 0 ? Math.ceil(-b.y1) + inset : 0,
      r = b.x2 > this._width  ? Math.ceil(+b.x2 - this._width) + inset : 0;
  b = b.y2 > this._height ? Math.ceil(+b.y2 - this._height) + inset : 0;
  pad = {left:l, top:t, right:r, bottom:b};

  if (this._strict) {
    this._autopad = 0;
    this._padding = pad;
    this._width = Math.max(0, this.__width - (l+r));
    this._height = Math.max(0, this.__height - (t+b));

    this._model.width(this._width).height(this._height).reset();
    setSignal.call(this, 'width', this._width);
    setSignal.call(this, 'height', this._height);
    setSignal.call(this, 'padding', pad);

    this.initialize().update({props:'enter'}).update({props:'update'});
  } else {
    this.padding(pad).update(opt);
  }
  return this;
};

prototype.viewport = function(size) {
  if (!arguments.length) return this._viewport;
  if (this._viewport !== size) {
    this._viewport = size;
    this.initialize();
  }
  return this;
};

prototype.renderer = function(type) {
  if (!arguments.length) return this._renderer;
  if (this._renderers[type]) type = this._renderers[type];
  else if (dl.isString(type)) throw new Error('Unknown renderer: ' + type);
  else if (!type) throw new Error('No renderer specified');

  if (this._io !== type) {
    this._io = type;
    this._renderer = null;
    this.initialize();
    if (this._build) this.render();
  }
  return this;
};

prototype.initialize = function(el) {
  var v = this, prevHandler,
      w = v._width, h = v._height, pad = v._padding, bg = v._bgcolor,
      config = this.model().config();

  if (!arguments.length || el === null) {
    el = this._el ? this._el.parentNode : null;
    if (!el) return this;  // This View cannot init w/o an
  }

  // clear pre-existing container
  d3.select(el).select('div.vega').remove();

  // add div container
  this._el = el = d3.select(el)
    .append('div')
    .attr('class', 'vega')
    .style('position', 'relative')
    .node();
  if (v._viewport) {
    d3.select(el)
      .style('width',  (v._viewport[0] || w)+'px')
      .style('height', (v._viewport[1] || h)+'px')
      .style('overflow', 'auto');
  }

  // renderer
  sg.canvas.Renderer.RETINA = config.render.retina;
  v._renderer = (v._renderer || new this._io.Renderer(config.load))
    .initialize(el, w, h, pad)
    .background(bg);

  // input handler
  prevHandler = v._handler;
  v._handler = new this._io.Handler()
    .initialize(el, pad, v);

  if (prevHandler) {
    prevHandler.handlers().forEach(function(h) {
      v._handler.on(h.type, h.handler);
    });
  } else {
    // Register event listeners for signal stream definitions.
    v._detach = parseStreams(this);
  }

  return (this._repaint = true, this);
};

prototype.destroy = function() {
  if (this._detach) this._detach();
};

function build() {
  var v = this;
  v._renderNode = new df.Node(v._model)
    .router(true);

  v._renderNode.evaluate = function(input) {
    log.debug(input, ['rendering']);

    var s = v._model.scene(),
        h = v._handler;

    if (h && h.scene) h.scene(s);

    if (input.trans) {
      input.trans.start(function(items) { v._renderer.render(s, items); });
    } else if (v._repaint) {
      v._renderer.render(s);
    } else if (input.dirty.length) {
      v._renderer.render(s, input.dirty);
    }

    if (input.dirty.length) {
      input.dirty.forEach(function(i) { i._dirty = false; });
      s.items[0]._dirty = false;
    }

    v._repaint = v._skipSignals = false;
    return input;
  };

  return (v._model.scene(v._renderNode), true);
}

prototype.update = function(opt) {
  opt = opt || {};
  var v = this,
      model = this._model,
      streamer = this._streamer,
      cs = this._changeset,
      trans = opt.duration ? new Transition(opt.duration, opt.ease) : null;

  if (trans) cs.trans = trans;
  if (opt.props !== undefined) {
    if (dl.keys(cs.data).length > 0) {
      throw Error(
        'New data values are not reflected in the visualization.' +
        ' Please call view.update() before updating a specified property set.'
      );
    }

    cs.reflow  = true;
    cs.request = opt.props;
  }

  var built = v._build;
  v._build = v._build || build.call(this);

  // If specific items are specified, short-circuit dataflow graph.
  // Else-If there are streaming updates, perform a targeted propagation.
  // Otherwise, re-evaluate the entire model (datasources + scene).
  if (opt.items && built) {
    Encoder.update(model, opt.trans, opt.props, opt.items, cs.dirty);
    v._renderNode.evaluate(cs);
  } else if (streamer.listeners().length && built) {
    // Include re-evaluation entire model when repaint flag is set
    if (this._repaint) streamer.addListener(model.node());
    model.propagate(cs, streamer, null, this._skipSignals);
    streamer.disconnect();
  } else {
    model.fire(cs);
  }

  v._changeset = df.ChangeSet.create();

  return v.autopad(opt);
};

prototype.toImageURL = function(type) {
  var v = this, Renderer;

  // lookup appropriate renderer
  switch (type || 'png') {
    case 'canvas':
    case 'png':
      Renderer = sg.canvas.Renderer; break;
    case 'svg':
      Renderer = sg.svg.string.Renderer; break;
    default: throw Error('Unrecognized renderer type: ' + type);
  }

  var retina = sg.canvas.Renderer.RETINA;
  sg.canvas.Renderer.RETINA = false; // ignore retina screen

  // render the scenegraph
  var ren = new Renderer(v._model.config.load)
    .initialize(null, v._width, v._height, v._padding)
    .background(v._bgcolor)
    .render(v._model.scene());

  sg.canvas.Renderer.RETINA = retina; // restore retina settings

  // return data url
  if (type === 'svg') {
    var blob = new Blob([ren.svg()], {type: 'image/svg+xml'});
    return window.URL.createObjectURL(blob);
  } else {
    return ren.canvas().toDataURL('image/png');
  }
};

prototype.render = function(items) {
  this._renderer.render(this._model.scene(), items);
  return this;
};

prototype.on = function() {
  this._handler.on.apply(this._handler, arguments);
  return this;
};

prototype.onSignal = function(name, handler) {
  var sg = this._model.signal(name);
  return (sg ?
    sg.on(handler) : log.error('Signal "'+name+'" is not defined.'), this);
};

prototype.off = function() {
  this._handler.off.apply(this._handler, arguments);
  return this;
};

prototype.offSignal = function(name, handler) {
  var sg = this._model.signal(name);
  return (sg ?
    sg.off(handler) : log.error('Signal "'+name+'" is not defined.'), this);
};

View.factory = function(model) {
  var HeadlessView = __webpack_require__("oCPx");
  return function(opt) {
    opt = opt || {};
    var defs = model.defs();
    var v = (opt.el ? new View() : new HeadlessView())
      .model(model)
      .renderer(opt.renderer || 'canvas')
      .width(defs.width)
      .height(defs.height)
      .background(defs.background)
      .padding(defs.padding)
      .viewport(defs.viewport)
      .initialize(opt.el);

    if (opt.data) v.data(opt.data);

    // Register handlers for the hover propset and cursors.
    if (opt.el) {
      if (opt.hover !== false) {
        v.on('mouseover', function(evt, item) {
          if (item && item.hasPropertySet('hover')) {
            this.update({props:'hover', items:item});
          }
        })
        .on('mouseout', function(evt, item) {
          if (item && item.hasPropertySet('hover')) {
            this.update({props:'update', items:item});
          }
        });
      }

      if (opt.cursor !== false) {
        // If value is a string, it is a custom value set by the user.
        // In this case, the user is responsible for maintaining the cursor state
        // and control only reverts back to this handler if set back to 'default'.
        v.onSignal('cursor', function(name, value) {
          var body = d3.select('body');
          if (dl.isString(value)) {
            v._cursor = value === 'default';
            body.style('cursor', value);
          } else if (dl.isObject(value) && v._cursor) {
            body.style('cursor', value.default);
          }
        });
      }
    }

    return v;
  };
};

module.exports = View;


/***/ }),

/***/ "/2vj":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");
var stats = __webpack_require__("uHQN");

var REM = '__dl_rem__';

function Collector(key) {
  this._add = [];
  this._rem = [];
  this._key = key || null;
  this._last = null;
}

var proto = Collector.prototype;

proto.add = function(v) {
  this._add.push(v);
};

proto.rem = function(v) {
  this._rem.push(v);
};

proto.values = function() {
  this._get = null;
  if (this._rem.length === 0) return this._add;

  var a = this._add,
      r = this._rem,
      k = this._key,
      x = Array(a.length - r.length),
      i, j, n, m;

  if (!util.isObject(r[0])) {
    // processing raw values
    m = stats.count.map(r);
    for (i=0, j=0, n=a.length; i<n; ++i) {
      if (m[a[i]] > 0) {
        m[a[i]] -= 1;
      } else {
        x[j++] = a[i];
      }
    }
  } else if (k) {
    // has unique key field, so use that
    m = util.toMap(r, k);
    for (i=0, j=0, n=a.length; i<n; ++i) {
      if (!m.hasOwnProperty(k(a[i]))) { x[j++] = a[i]; }
    }
  } else {
    // no unique key, mark tuples directly
    for (i=0, n=r.length; i<n; ++i) {
      r[i][REM] = 1;
    }
    for (i=0, j=0, n=a.length; i<n; ++i) {
      if (!a[i][REM]) { x[j++] = a[i]; }
    }
    for (i=0, n=r.length; i<n; ++i) {
      delete r[i][REM];
    }
  }

  this._rem = [];
  return (this._add = x);
};

// memoizing statistics methods

proto.extent = function(get) {
  if (this._get !== get || !this._ext) {
    var v = this.values(),
        i = stats.extent.index(v, get);
    this._ext = [v[i[0]], v[i[1]]];
    this._get = get;
  }
  return this._ext;
};

proto.argmin = function(get) {
  return this.extent(get)[0];
};

proto.argmax = function(get) {
  return this.extent(get)[1];
};

proto.min = function(get) {
  var m = this.extent(get)[0];
  return m != null ? get(m) : +Infinity;
};

proto.max = function(get) {
  var m = this.extent(get)[1];
  return m != null ? get(m) : -Infinity;
};

proto.quartile = function(get) {
  if (this._get !== get || !this._q) {
    this._q = stats.quartile(this.values(), get);
    this._get = get;
  }
  return this._q;
};

proto.q1 = function(get) {
  return this.quartile(get)[0];
};

proto.q2 = function(get) {
  return this.quartile(get)[1];
};

proto.q3 = function(get) {
  return this.quartile(get)[2];
};

module.exports = Collector;


/***/ }),

/***/ "/7Ur":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var aggregate_1 = __webpack_require__("h/tW");
var timeunit_1 = __webpack_require__("z5TJ");
var type_1 = __webpack_require__("WJ2w");
var vlEncoding = __webpack_require__("QSMf");
var mark_1 = __webpack_require__("j8cM");
exports.DELIM = '|';
exports.ASSIGN = '=';
exports.TYPE = ',';
exports.FUNC = '_';
function shorten(spec) {
    return 'mark' + exports.ASSIGN + spec.mark +
        exports.DELIM + shortenEncoding(spec.encoding);
}
exports.shorten = shorten;
function parse(shorthand, data, config) {
    var split = shorthand.split(exports.DELIM), mark = split.shift().split(exports.ASSIGN)[1].trim(), encoding = parseEncoding(split.join(exports.DELIM));
    var spec = {
        mark: mark_1.Mark[mark],
        encoding: encoding
    };
    if (data !== undefined) {
        spec.data = data;
    }
    if (config !== undefined) {
        spec.config = config;
    }
    return spec;
}
exports.parse = parse;
function shortenEncoding(encoding) {
    return vlEncoding.map(encoding, function (fieldDef, channel) {
        return channel + exports.ASSIGN + shortenFieldDef(fieldDef);
    }).join(exports.DELIM);
}
exports.shortenEncoding = shortenEncoding;
function parseEncoding(encodingShorthand) {
    return encodingShorthand.split(exports.DELIM).reduce(function (m, e) {
        var split = e.split(exports.ASSIGN), enctype = split[0].trim(), fieldDefShorthand = split[1];
        m[enctype] = parseFieldDef(fieldDefShorthand);
        return m;
    }, {});
}
exports.parseEncoding = parseEncoding;
function shortenFieldDef(fieldDef) {
    return (fieldDef.aggregate ? fieldDef.aggregate + exports.FUNC : '') +
        (fieldDef.timeUnit ? fieldDef.timeUnit + exports.FUNC : '') +
        (fieldDef.bin ? 'bin' + exports.FUNC : '') +
        (fieldDef.field || '') + exports.TYPE + type_1.SHORT_TYPE[fieldDef.type];
}
exports.shortenFieldDef = shortenFieldDef;
function shortenFieldDefs(fieldDefs, delim) {
    if (delim === void 0) { delim = exports.DELIM; }
    return fieldDefs.map(shortenFieldDef).join(delim);
}
exports.shortenFieldDefs = shortenFieldDefs;
function parseFieldDef(fieldDefShorthand) {
    var split = fieldDefShorthand.split(exports.TYPE);
    var fieldDef = {
        field: split[0].trim(),
        type: type_1.TYPE_FROM_SHORT_TYPE[split[1].trim()]
    };
    for (var i = 0; i < aggregate_1.AGGREGATE_OPS.length; i++) {
        var a = aggregate_1.AGGREGATE_OPS[i];
        if (fieldDef.field.indexOf(a + '_') === 0) {
            fieldDef.field = fieldDef.field.substr(a.toString().length + 1);
            if (a === aggregate_1.AggregateOp.COUNT && fieldDef.field.length === 0) {
                fieldDef.field = '*';
            }
            fieldDef.aggregate = a;
            break;
        }
    }
    for (var i = 0; i < timeunit_1.TIMEUNITS.length; i++) {
        var tu = timeunit_1.TIMEUNITS[i];
        if (fieldDef.field && fieldDef.field.indexOf(tu + '_') === 0) {
            fieldDef.field = fieldDef.field.substr(fieldDef.field.length + 1);
            fieldDef.timeUnit = tu;
            break;
        }
    }
    if (fieldDef.field && fieldDef.field.indexOf('bin_') === 0) {
        fieldDef.field = fieldDef.field.substr(4);
        fieldDef.bin = true;
    }
    return fieldDef;
}
exports.parseFieldDef = parseFieldDef;
//# sourceMappingURL=shorthand.js.map

/***/ }),

/***/ "/MHv":
/***/ (function(module, exports) {

var segmentCache = {},
    bezierCache = {},
    join = [].join;

// Copied from Inkscape svgtopdf, thanks!
function segments(x, y, rx, ry, large, sweep, rotateX, ox, oy) {
  var key = join.call(arguments);
  if (segmentCache[key]) {
    return segmentCache[key];
  }

  var th = rotateX * (Math.PI/180);
  var sin_th = Math.sin(th);
  var cos_th = Math.cos(th);
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  var px = cos_th * (ox - x) * 0.5 + sin_th * (oy - y) * 0.5;
  var py = cos_th * (oy - y) * 0.5 - sin_th * (ox - x) * 0.5;
  var pl = (px*px) / (rx*rx) + (py*py) / (ry*ry);
  if (pl > 1) {
    pl = Math.sqrt(pl);
    rx *= pl;
    ry *= pl;
  }

  var a00 = cos_th / rx;
  var a01 = sin_th / rx;
  var a10 = (-sin_th) / ry;
  var a11 = (cos_th) / ry;
  var x0 = a00 * ox + a01 * oy;
  var y0 = a10 * ox + a11 * oy;
  var x1 = a00 * x + a01 * y;
  var y1 = a10 * x + a11 * y;

  var d = (x1-x0) * (x1-x0) + (y1-y0) * (y1-y0);
  var sfactor_sq = 1 / d - 0.25;
  if (sfactor_sq < 0) sfactor_sq = 0;
  var sfactor = Math.sqrt(sfactor_sq);
  if (sweep == large) sfactor = -sfactor;
  var xc = 0.5 * (x0 + x1) - sfactor * (y1-y0);
  var yc = 0.5 * (y0 + y1) + sfactor * (x1-x0);

  var th0 = Math.atan2(y0-yc, x0-xc);
  var th1 = Math.atan2(y1-yc, x1-xc);

  var th_arc = th1-th0;
  if (th_arc < 0 && sweep === 1){
    th_arc += 2 * Math.PI;
  } else if (th_arc > 0 && sweep === 0) {
    th_arc -= 2 * Math.PI;
  }

  var segs = Math.ceil(Math.abs(th_arc / (Math.PI * 0.5 + 0.001)));
  var result = [];
  for (var i=0; i<segs; ++i) {
    var th2 = th0 + i * th_arc / segs;
    var th3 = th0 + (i+1) * th_arc / segs;
    result[i] = [xc, yc, th2, th3, rx, ry, sin_th, cos_th];
  }

  return (segmentCache[key] = result);
}

function bezier(params) {
  var key = join.call(params);
  if (bezierCache[key]) {
    return bezierCache[key];
  }
  
  var cx = params[0],
      cy = params[1],
      th0 = params[2],
      th1 = params[3],
      rx = params[4],
      ry = params[5],
      sin_th = params[6],
      cos_th = params[7];

  var a00 = cos_th * rx;
  var a01 = -sin_th * ry;
  var a10 = sin_th * rx;
  var a11 = cos_th * ry;

  var cos_th0 = Math.cos(th0);
  var sin_th0 = Math.sin(th0);
  var cos_th1 = Math.cos(th1);
  var sin_th1 = Math.sin(th1);

  var th_half = 0.5 * (th1 - th0);
  var sin_th_h2 = Math.sin(th_half * 0.5);
  var t = (8/3) * sin_th_h2 * sin_th_h2 / Math.sin(th_half);
  var x1 = cx + cos_th0 - t * sin_th0;
  var y1 = cy + sin_th0 + t * cos_th0;
  var x3 = cx + cos_th1;
  var y3 = cy + sin_th1;
  var x2 = x3 + t * sin_th1;
  var y2 = y3 - t * cos_th1;

  return (bezierCache[key] = [
    a00 * x1 + a01 * y1,  a10 * x1 + a11 * y1,
    a00 * x2 + a01 * y2,  a10 * x2 + a11 * y2,
    a00 * x3 + a01 * y3,  a10 * x3 + a11 * y3
  ]);
}

module.exports = {
  segments: segments,
  bezier: bezier,
  cache: {
    segments: segmentCache,
    bezier: bezierCache
  }
};


/***/ }),

/***/ "/lc5":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log  = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Sort(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {by: {type: 'array<field>'} });
  this.router(true);
}

var prototype = (Sort.prototype = Object.create(Transform.prototype));
prototype.constructor = Sort;

prototype.transform = function(input) {
  log.debug(input, ['sorting']);

  if (input.add.length || input.mod.length || input.rem.length) {
    input.sort = dl.comparator(this.param('by').field);
  }
  return input;
};

module.exports = Sort;

Sort.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Sort transform",
  "description": "Sorts the values of a data set.",
  "type": "object",
  "properties": {
    "type": {"enum": ["sort"]},
    "by": {
      "oneOf": [
        {"type": "string"},
        {"type": "array", "items": {"type": "string"}}
      ],
      "description": "A list of fields to use as sort criteria."
    }
  },
  "required": ["type", "by"]
};


/***/ }),

/***/ "0ZZw":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var encoding_1 = __webpack_require__("QSMf");
var fielddef_1 = __webpack_require__("o+e1");
var mark_1 = __webpack_require__("j8cM");
var scale_1 = __webpack_require__("Fw/k");
var util_1 = __webpack_require__("ZAUf");
var area_1 = __webpack_require__("k2D6");
var bar_1 = __webpack_require__("SIx5");
var common_1 = __webpack_require__("MtYt");
var line_1 = __webpack_require__("HES2");
var point_1 = __webpack_require__("rKP5");
var rule_1 = __webpack_require__("8lgt");
var text_1 = __webpack_require__("G+HP");
var tick_1 = __webpack_require__("XL1Y");
var markCompiler = {
    area: area_1.area,
    bar: bar_1.bar,
    line: line_1.line,
    point: point_1.point,
    text: text_1.text,
    tick: tick_1.tick,
    rule: rule_1.rule,
    circle: point_1.circle,
    square: point_1.square
};
function parseMark(model) {
    if (util_1.contains([mark_1.LINE, mark_1.AREA], model.mark())) {
        return parsePathMark(model);
    }
    else {
        return parseNonPathMark(model);
    }
}
exports.parseMark = parseMark;
function parsePathMark(model) {
    var mark = model.mark();
    var isFaceted = model.parent() && model.parent().isFacet();
    var dataFrom = { data: model.dataTable() };
    var details = detailFields(model);
    var pathMarks = [
        {
            name: model.name('marks'),
            type: markCompiler[mark].markType(),
            from: util_1.extend(isFaceted || details.length > 0 ? {} : dataFrom, { transform: [{ type: 'sort', by: sortPathBy(model) }] }),
            properties: { update: markCompiler[mark].properties(model) }
        }
    ];
    if (details.length > 0) {
        var facetTransform = { type: 'facet', groupby: details };
        var transform = mark === mark_1.AREA && model.stack() ?
            stackTransforms(model, true).concat(facetTransform) :
            [].concat(facetTransform, model.has(channel_1.ORDER) ? [{ type: 'sort', by: sortBy(model) }] : []);
        return [{
                name: model.name('pathgroup'),
                type: 'group',
                from: util_1.extend(isFaceted ? {} : dataFrom, { transform: transform }),
                properties: {
                    update: {
                        width: { field: { group: 'width' } },
                        height: { field: { group: 'height' } }
                    }
                },
                marks: pathMarks
            }];
    }
    else {
        return pathMarks;
    }
}
function parseNonPathMark(model) {
    var mark = model.mark();
    var isFaceted = model.parent() && model.parent().isFacet();
    var dataFrom = { data: model.dataTable() };
    var marks = [];
    if (mark === mark_1.TEXT &&
        model.has(channel_1.COLOR) &&
        model.config().mark.applyColorToBackground && !model.has(channel_1.X) && !model.has(channel_1.Y)) {
        marks.push(util_1.extend({
            name: model.name('background'),
            type: 'rect'
        }, isFaceted ? {} : { from: dataFrom }, { properties: { update: text_1.text.background(model) } }));
    }
    marks.push(util_1.extend({
        name: model.name('marks'),
        type: markCompiler[mark].markType()
    }, (!isFaceted || model.stack() || model.has(channel_1.ORDER)) ? {
        from: util_1.extend(isFaceted ? {} : dataFrom, model.stack() ?
            { transform: stackTransforms(model, false) } :
            model.has(channel_1.ORDER) ?
                { transform: [{ type: 'sort', by: sortBy(model) }] } :
                {})
    } : {}, { properties: { update: markCompiler[mark].properties(model) } }));
    if (model.has(channel_1.LABEL) && markCompiler[mark].labels) {
        var labelProperties = markCompiler[mark].labels(model);
        if (labelProperties !== undefined) {
            marks.push(util_1.extend({
                name: model.name('label'),
                type: 'text'
            }, isFaceted ? {} : { from: dataFrom }, { properties: { update: labelProperties } }));
        }
    }
    return marks;
}
function sortBy(model) {
    if (model.has(channel_1.ORDER)) {
        var channelDef = model.encoding().order;
        if (channelDef instanceof Array) {
            return channelDef.map(common_1.sortField);
        }
        else {
            return common_1.sortField(channelDef);
        }
    }
    return null;
}
function sortPathBy(model) {
    if (model.mark() === mark_1.LINE && model.has(channel_1.PATH)) {
        var channelDef = model.encoding().path;
        if (channelDef instanceof Array) {
            return channelDef.map(common_1.sortField);
        }
        else {
            return common_1.sortField(channelDef);
        }
    }
    else {
        return '-' + model.field(model.config().mark.orient === 'horizontal' ? channel_1.Y : channel_1.X, { binSuffix: '_mid' });
    }
}
function detailFields(model) {
    return [channel_1.COLOR, channel_1.DETAIL, channel_1.OPACITY, channel_1.SHAPE].reduce(function (details, channel) {
        if (model.has(channel) && !model.fieldDef(channel).aggregate) {
            details.push(model.field(channel));
        }
        return details;
    }, []);
}
function stackTransforms(model, impute) {
    var stackByFields = getStackByFields(model);
    if (impute) {
        return [imputeTransform(model, stackByFields), stackTransform(model, stackByFields)];
    }
    return [stackTransform(model, stackByFields)];
}
function getStackByFields(model) {
    var encoding = model.encoding();
    return channel_1.STACK_GROUP_CHANNELS.reduce(function (fields, channel) {
        var channelEncoding = encoding[channel];
        if (encoding_1.has(encoding, channel)) {
            if (util_1.isArray(channelEncoding)) {
                channelEncoding.forEach(function (fieldDef) {
                    fields.push(fielddef_1.field(fieldDef));
                });
            }
            else {
                var fieldDef = channelEncoding;
                var scale = model.scale(channel);
                fields.push(fielddef_1.field(fieldDef, {
                    binSuffix: scale && scale.type === scale_1.ScaleType.ORDINAL ? '_range' : '_start'
                }));
            }
        }
        return fields;
    }, []);
}
function imputeTransform(model, stackFields) {
    var stack = model.stack();
    return {
        type: 'impute',
        field: model.field(stack.fieldChannel),
        groupby: stackFields,
        orderby: [model.field(stack.groupbyChannel, { binSuffix: '_mid' })],
        method: 'value',
        value: 0
    };
}
function stackTransform(model, stackFields) {
    var stack = model.stack();
    var encoding = model.encoding();
    var sortby = model.has(channel_1.ORDER) ?
        (util_1.isArray(encoding[channel_1.ORDER]) ? encoding[channel_1.ORDER] : [encoding[channel_1.ORDER]]).map(common_1.sortField) :
        stackFields.map(function (field) {
            return '-' + field;
        });
    var valName = model.field(stack.fieldChannel);
    var transform = {
        type: 'stack',
        groupby: [model.field(stack.groupbyChannel, { binSuffix: '_mid' })],
        field: model.field(stack.fieldChannel),
        sortby: sortby,
        output: {
            start: valName + '_start',
            end: valName + '_end'
        }
    };
    if (stack.offset) {
        transform.offset = stack.offset;
    }
    return transform;
}
//# sourceMappingURL=mark.js.map

/***/ }),

/***/ "1/F5":
/***/ (function(module, exports, __webpack_require__) {

(function (global, factory) {
   true ? factory(exports) :
  typeof define === 'function' && define.amd ? define('d3-format', ['exports'], factory) :
  factory((global.d3_format = {}));
}(this, function (exports) { 'use strict';

  // Computes the decimal coefficient and exponent of the specified number x with
  // significant digits p, where x is positive and p is in [1, 21] or undefined.
  // For example, formatDecimal(1.23) returns ["123", 0].
  function formatDecimal(x, p) {
    if ((i = (x = p ? x.toExponential(p - 1) : x.toExponential()).indexOf("e")) < 0) return null; // NaN, ±Infinity
    var i, coefficient = x.slice(0, i);

    // The string returned by toExponential either has the form \d\.\d+e[-+]\d+
    // (e.g., 1.2e+3) or the form \de[-+]\d+ (e.g., 1e+3).
    return [
      coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
      +x.slice(i + 1)
    ];
  };

  function exponent(x) {
    return x = formatDecimal(Math.abs(x)), x ? x[1] : NaN;
  };

  function formatGroup(grouping, thousands) {
    return function(value, width) {
      var i = value.length,
          t = [],
          j = 0,
          g = grouping[0],
          length = 0;

      while (i > 0 && g > 0) {
        if (length + g + 1 > width) g = Math.max(1, width - length);
        t.push(value.substring(i -= g, i + g));
        if ((length += g + 1) > width) break;
        g = grouping[j = (j + 1) % grouping.length];
      }

      return t.reverse().join(thousands);
    };
  };

  var prefixExponent;

  function formatPrefixAuto(x, p) {
    var d = formatDecimal(x, p);
    if (!d) return x + "";
    var coefficient = d[0],
        exponent = d[1],
        i = exponent - (prefixExponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3) + 1,
        n = coefficient.length;
    return i === n ? coefficient
        : i > n ? coefficient + new Array(i - n + 1).join("0")
        : i > 0 ? coefficient.slice(0, i) + "." + coefficient.slice(i)
        : "0." + new Array(1 - i).join("0") + formatDecimal(x, Math.max(0, p + i - 1))[0]; // less than 1y!
  };

  function formatRounded(x, p) {
    var d = formatDecimal(x, p);
    if (!d) return x + "";
    var coefficient = d[0],
        exponent = d[1];
    return exponent < 0 ? "0." + new Array(-exponent).join("0") + coefficient
        : coefficient.length > exponent + 1 ? coefficient.slice(0, exponent + 1) + "." + coefficient.slice(exponent + 1)
        : coefficient + new Array(exponent - coefficient.length + 2).join("0");
  };

  function formatDefault(x, p) {
    x = x.toPrecision(p);

    out: for (var n = x.length, i = 1, i0 = -1, i1; i < n; ++i) {
      switch (x[i]) {
        case ".": i0 = i1 = i; break;
        case "0": if (i0 === 0) i0 = i; i1 = i; break;
        case "e": break out;
        default: if (i0 > 0) i0 = 0; break;
      }
    }

    return i0 > 0 ? x.slice(0, i0) + x.slice(i1 + 1) : x;
  };

  var formatTypes = {
    "": formatDefault,
    "%": function(x, p) { return (x * 100).toFixed(p); },
    "b": function(x) { return Math.round(x).toString(2); },
    "c": function(x) { return x + ""; },
    "d": function(x) { return Math.round(x).toString(10); },
    "e": function(x, p) { return x.toExponential(p); },
    "f": function(x, p) { return x.toFixed(p); },
    "g": function(x, p) { return x.toPrecision(p); },
    "o": function(x) { return Math.round(x).toString(8); },
    "p": function(x, p) { return formatRounded(x * 100, p); },
    "r": formatRounded,
    "s": formatPrefixAuto,
    "X": function(x) { return Math.round(x).toString(16).toUpperCase(); },
    "x": function(x) { return Math.round(x).toString(16); }
  };

  // [[fill]align][sign][symbol][0][width][,][.precision][type]
  var re = /^(?:(.)?([<>=^]))?([+\-\( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?([a-z%])?$/i;

  function formatSpecifier(specifier) {
    return new FormatSpecifier(specifier);
  };

  function FormatSpecifier(specifier) {
    if (!(match = re.exec(specifier))) throw new Error("invalid format: " + specifier);

    var match,
        fill = match[1] || " ",
        align = match[2] || ">",
        sign = match[3] || "-",
        symbol = match[4] || "",
        zero = !!match[5],
        width = match[6] && +match[6],
        comma = !!match[7],
        precision = match[8] && +match[8].slice(1),
        type = match[9] || "";

    // The "n" type is an alias for ",g".
    if (type === "n") comma = true, type = "g";

    // Map invalid types to the default format.
    else if (!formatTypes[type]) type = "";

    // If zero fill is specified, padding goes after sign and before digits.
    if (zero || (fill === "0" && align === "=")) zero = true, fill = "0", align = "=";

    this.fill = fill;
    this.align = align;
    this.sign = sign;
    this.symbol = symbol;
    this.zero = zero;
    this.width = width;
    this.comma = comma;
    this.precision = precision;
    this.type = type;
  }

  FormatSpecifier.prototype.toString = function() {
    return this.fill
        + this.align
        + this.sign
        + this.symbol
        + (this.zero ? "0" : "")
        + (this.width == null ? "" : Math.max(1, this.width | 0))
        + (this.comma ? "," : "")
        + (this.precision == null ? "" : "." + Math.max(0, this.precision | 0))
        + this.type;
  };

  var prefixes = ["y","z","a","f","p","n","µ","m","","k","M","G","T","P","E","Z","Y"];

  function identity(x) {
    return x;
  }

  function locale(locale) {
    var group = locale.grouping && locale.thousands ? formatGroup(locale.grouping, locale.thousands) : identity,
        currency = locale.currency,
        decimal = locale.decimal;

    function format(specifier) {
      specifier = formatSpecifier(specifier);

      var fill = specifier.fill,
          align = specifier.align,
          sign = specifier.sign,
          symbol = specifier.symbol,
          zero = specifier.zero,
          width = specifier.width,
          comma = specifier.comma,
          precision = specifier.precision,
          type = specifier.type;

      // Compute the prefix and suffix.
      // For SI-prefix, the suffix is lazily computed.
      var prefix = symbol === "$" ? currency[0] : symbol === "#" && /[boxX]/.test(type) ? "0" + type.toLowerCase() : "",
          suffix = symbol === "$" ? currency[1] : /[%p]/.test(type) ? "%" : "";

      // What format function should we use?
      // Is this an integer type?
      // Can this type generate exponential notation?
      var formatType = formatTypes[type],
          maybeSuffix = !type || /[defgprs%]/.test(type);

      // Set the default precision if not specified,
      // or clamp the specified precision to the supported range.
      // For significant precision, it must be in [1, 21].
      // For fixed precision, it must be in [0, 20].
      precision = precision == null ? (type ? 6 : 12)
          : /[gprs]/.test(type) ? Math.max(1, Math.min(21, precision))
          : Math.max(0, Math.min(20, precision));

      return function(value) {
        var valuePrefix = prefix,
            valueSuffix = suffix;

        if (type === "c") {
          valueSuffix = formatType(value) + valueSuffix;
          value = "";
        } else {
          value = +value;

          // Convert negative to positive, and compute the prefix.
          // Note that -0 is not less than 0, but 1 / -0 is!
          var valueNegative = (value < 0 || 1 / value < 0) && (value *= -1, true);

          // Perform the initial formatting.
          value = formatType(value, precision);

          // If the original value was negative, it may be rounded to zero during
          // formatting; treat this as (positive) zero.
          if (valueNegative) {
            var i = -1, n = value.length, c;
            valueNegative = false;
            while (++i < n) {
              if (c = value.charCodeAt(i), (48 < c && c < 58)
                  || (type === "x" && 96 < c && c < 103)
                  || (type === "X" && 64 < c && c < 71)) {
                valueNegative = true;
                break;
              }
            }
          }

          // Compute the prefix and suffix.
          valuePrefix = (valueNegative ? (sign === "(" ? sign : "-") : sign === "-" || sign === "(" ? "" : sign) + valuePrefix;
          valueSuffix = valueSuffix + (type === "s" ? prefixes[8 + prefixExponent / 3] : "") + (valueNegative && sign === "(" ? ")" : "");

          // Break the formatted value into the integer “value” part that can be
          // grouped, and fractional or exponential “suffix” part that is not.
          if (maybeSuffix) {
            var i = -1, n = value.length, c;
            while (++i < n) {
              if (c = value.charCodeAt(i), 48 > c || c > 57) {
                valueSuffix = (c === 46 ? decimal + value.slice(i + 1) : value.slice(i)) + valueSuffix;
                value = value.slice(0, i);
                break;
              }
            }
          }
        }

        // If the fill character is not "0", grouping is applied before padding.
        if (comma && !zero) value = group(value, Infinity);

        // Compute the padding.
        var length = valuePrefix.length + value.length + valueSuffix.length,
            padding = length < width ? new Array(width - length + 1).join(fill) : "";

        // If the fill character is "0", grouping is applied after padding.
        if (comma && zero) value = group(padding + value, padding.length ? width - valueSuffix.length : Infinity), padding = "";

        // Reconstruct the final output based on the desired alignment.
        switch (align) {
          case "<": return valuePrefix + value + valueSuffix + padding;
          case "=": return valuePrefix + padding + value + valueSuffix;
          case "^": return padding.slice(0, length = padding.length >> 1) + valuePrefix + value + valueSuffix + padding.slice(length);
        }
        return padding + valuePrefix + value + valueSuffix;
      };
    }

    function formatPrefix(specifier, value) {
      var f = format((specifier = formatSpecifier(specifier), specifier.type = "f", specifier)),
          e = Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3,
          k = Math.pow(10, -e),
          prefix = prefixes[8 + e / 3];
      return function(value) {
        return f(k * value) + prefix;
      };
    }

    return {
      format: format,
      formatPrefix: formatPrefix
    };
  };

  var defaultLocale = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["$", ""]
  });

  var caES = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "\xa0€"]
  });

  var csCZ = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "\xa0Kč"],
  });

  var deCH = locale({
    decimal: ",",
    thousands: "'",
    grouping: [3],
    currency: ["", "\xa0CHF"]
  });

  var deDE = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "\xa0€"]
  });

  var enCA = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["$", ""]
  });

  var enGB = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["£", ""]
  });

  var esES = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "\xa0€"]
  });

  var fiFI = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "\xa0€"]
  });

  var frCA = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "$"]
  });

  var frFR = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "\xa0€"]
  });

  var heIL = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["₪", ""]
  });

  var huHU = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "\xa0Ft"]
  });

  var itIT = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["€", ""]
  });

  var jaJP = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["", "円"]
  });

  var koKR = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["₩", ""]
  });

  var mkMK = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "\xa0ден."]
  });

  var nlNL = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["€\xa0", ""]
  });

  var plPL = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["", "zł"]
  });

  var ptBR = locale({
    decimal: ",",
    thousands: ".",
    grouping: [3],
    currency: ["R$", ""]
  });

  var ruRU = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "\xa0руб."]
  });

  var svSE = locale({
    decimal: ",",
    thousands: "\xa0",
    grouping: [3],
    currency: ["", "SEK"]
  });

  var zhCN = locale({
    decimal: ".",
    thousands: ",",
    grouping: [3],
    currency: ["¥", ""]
  });

  function precisionFixed(step) {
    return Math.max(0, -exponent(Math.abs(step)));
  };

  function precisionPrefix(step, value) {
    return Math.max(0, Math.max(-8, Math.min(8, Math.floor(exponent(value) / 3))) * 3 - exponent(Math.abs(step)));
  };

  function precisionRound(step, max) {
    step = Math.abs(step), max = Math.abs(max) - step;
    return Math.max(0, exponent(max) - exponent(step)) + 1;
  };

  var format = defaultLocale.format;
  var formatPrefix = defaultLocale.formatPrefix;

  var version = "0.4.2";

  exports.version = version;
  exports.format = format;
  exports.formatPrefix = formatPrefix;
  exports.locale = locale;
  exports.localeCaEs = caES;
  exports.localeCsCz = csCZ;
  exports.localeDeCh = deCH;
  exports.localeDeDe = deDE;
  exports.localeEnCa = enCA;
  exports.localeEnGb = enGB;
  exports.localeEnUs = defaultLocale;
  exports.localeEsEs = esES;
  exports.localeFiFi = fiFI;
  exports.localeFrCa = frCA;
  exports.localeFrFr = frFR;
  exports.localeHeIl = heIL;
  exports.localeHuHu = huHU;
  exports.localeItIt = itIT;
  exports.localeJaJp = jaJP;
  exports.localeKoKr = koKR;
  exports.localeMkMk = mkMK;
  exports.localeNlNl = nlNL;
  exports.localePlPl = plPL;
  exports.localePtBr = ptBR;
  exports.localeRuRu = ruRU;
  exports.localeSvSe = svSE;
  exports.localeZhCn = zhCN;
  exports.formatSpecifier = formatSpecifier;
  exports.precisionFixed = precisionFixed;
  exports.precisionPrefix = precisionPrefix;
  exports.precisionRound = precisionRound;

}));

/***/ }),

/***/ 10:
/***/ (function(module, exports) {

/* (ignored) */

/***/ }),

/***/ 11:
/***/ (function(module, exports) {

/* (ignored) */

/***/ }),

/***/ 12:
/***/ (function(module, exports) {

/* (ignored) */

/***/ }),

/***/ "1C2Q":
/***/ (function(module, exports) {

var gradient_id = 0;

function Gradient(type) {
  this.id = 'gradient_' + (gradient_id++);
  this.type = type || 'linear';
  this.stops = [];
  this.x1 = 0;
  this.x2 = 1;
  this.y1 = 0;
  this.y2 = 0;
}

var prototype = Gradient.prototype;

prototype.stop = function(offset, color) {
  this.stops.push({
    offset: offset,
    color: color
  });
  return this;
};

module.exports = Gradient;

/***/ }),

/***/ "1PdY":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var filter;
(function (filter_1) {
    function parse(model) {
        return model.transform().filter;
    }
    filter_1.parseUnit = parse;
    function parseFacet(model) {
        var filterComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source && childDataComponent.filter) {
            filterComponent =
                (filterComponent ? filterComponent + ' && ' : '') +
                    childDataComponent.filter;
            delete childDataComponent.filter;
        }
        return filterComponent;
    }
    filter_1.parseFacet = parseFacet;
    function parseLayer(model) {
        var filterComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (model.compatibleSource(child) && childDataComponent.filter && childDataComponent.filter === filterComponent) {
                delete childDataComponent.filter;
            }
        });
        return filterComponent;
    }
    filter_1.parseLayer = parseLayer;
    function assemble(component) {
        var filter = component.filter;
        return filter ? [{
                type: 'filter',
                test: filter
            }] : [];
    }
    filter_1.assemble = assemble;
})(filter = exports.filter || (exports.filter = {}));
//# sourceMappingURL=filter.js.map

/***/ }),

/***/ "2I0S":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");

var types = {
  'values': measure({
    name: 'values',
    init: 'cell.collect = true;',
    set:  'cell.data.values()', idx: -1
  }),
  'count': measure({
    name: 'count',
    set:  'cell.num'
  }),
  'missing': measure({
    name: 'missing',
    set:  'this.missing'
  }),
  'valid': measure({
    name: 'valid',
    set:  'this.valid'
  }),
  'sum': measure({
    name: 'sum',
    init: 'this.sum = 0;',
    add:  'this.sum += v;',
    rem:  'this.sum -= v;',
    set:  'this.sum'
  }),
  'mean': measure({
    name: 'mean',
    init: 'this.mean = 0;',
    add:  'var d = v - this.mean; this.mean += d / this.valid;',
    rem:  'var d = v - this.mean; this.mean -= this.valid ? d / this.valid : this.mean;',
    set:  'this.mean'
  }),
  'average': measure({
    name: 'average',
    set:  'this.mean',
    req:  ['mean'], idx: 1
  }),
  'variance': measure({
    name: 'variance',
    init: 'this.dev = 0;',
    add:  'this.dev += d * (v - this.mean);',
    rem:  'this.dev -= d * (v - this.mean);',
    set:  'this.valid > 1 ? this.dev / (this.valid-1) : 0',
    req:  ['mean'], idx: 1
  }),
  'variancep': measure({
    name: 'variancep',
    set:  'this.valid > 1 ? this.dev / this.valid : 0',
    req:  ['variance'], idx: 2
  }),
  'stdev': measure({
    name: 'stdev',
    set:  'this.valid > 1 ? Math.sqrt(this.dev / (this.valid-1)) : 0',
    req:  ['variance'], idx: 2
  }),
  'stdevp': measure({
    name: 'stdevp',
    set:  'this.valid > 1 ? Math.sqrt(this.dev / this.valid) : 0',
    req:  ['variance'], idx: 2
  }),
  'stderr': measure({
    name: 'stderr',
    set:  'this.valid > 1 ? Math.sqrt(this.dev / (this.valid * (this.valid-1))) : 0',
    req:  ['variance'], idx: 2
  }),
  'median': measure({
    name: 'median',
    set:  'cell.data.q2(this.get)',
    req:  ['values'], idx: 3
  }),
  'q1': measure({
    name: 'q1',
    set:  'cell.data.q1(this.get)',
    req:  ['values'], idx: 3
  }),
  'q3': measure({
    name: 'q3',
    set:  'cell.data.q3(this.get)',
    req:  ['values'], idx: 3
  }),
  'distinct': measure({
    name: 'distinct',
    set:  'this.distinct(cell.data.values(), this.get)',
    req:  ['values'], idx: 3
  }),
  'argmin': measure({
    name: 'argmin',
    add:  'if (v < this.min) this.argmin = t;',
    rem:  'if (v <= this.min) this.argmin = null;',
    set:  'this.argmin = this.argmin || cell.data.argmin(this.get)',
    req:  ['min'], str: ['values'], idx: 3
  }),
  'argmax': measure({
    name: 'argmax',
    add:  'if (v > this.max) this.argmax = t;',
    rem:  'if (v >= this.max) this.argmax = null;',
    set:  'this.argmax = this.argmax || cell.data.argmax(this.get)',
    req:  ['max'], str: ['values'], idx: 3
  }),
  'min': measure({
    name: 'min',
    init: 'this.min = +Infinity;',
    add:  'if (v < this.min) this.min = v;',
    rem:  'if (v <= this.min) this.min = NaN;',
    set:  'this.min = (isNaN(this.min) ? cell.data.min(this.get) : this.min)',
    str:  ['values'], idx: 4
  }),
  'max': measure({
    name: 'max',
    init: 'this.max = -Infinity;',
    add:  'if (v > this.max) this.max = v;',
    rem:  'if (v >= this.max) this.max = NaN;',
    set:  'this.max = (isNaN(this.max) ? cell.data.max(this.get) : this.max)',
    str:  ['values'], idx: 4
  }),
  'modeskew': measure({
    name: 'modeskew',
    set:  'this.dev===0 ? 0 : (this.mean - cell.data.q2(this.get)) / Math.sqrt(this.dev/(this.valid-1))',
    req:  ['mean', 'variance', 'median'], idx: 5
  })
};

function measure(base) {
  return function(out) {
    var m = util.extend({init:'', add:'', rem:'', idx:0}, base);
    m.out = out || base.name;
    return m;
  };
}

function resolve(agg, stream) {
  function collect(m, a) {
    function helper(r) { if (!m[r]) collect(m, m[r] = types[r]()); }
    if (a.req) a.req.forEach(helper);
    if (stream && a.str) a.str.forEach(helper);
    return m;
  }
  var map = agg.reduce(
    collect,
    agg.reduce(function(m, a) { return (m[a.name] = a, m); }, {})
  );
  return util.vals(map).sort(function(a, b) { return a.idx - b.idx; });
}

function create(agg, stream, accessor, mutator) {
  var all = resolve(agg, stream),
      ctr = 'this.cell = cell; this.tuple = t; this.valid = 0; this.missing = 0;',
      add = 'if (v==null) this.missing++; if (!this.isValid(v)) return; ++this.valid;',
      rem = 'if (v==null) this.missing--; if (!this.isValid(v)) return; --this.valid;',
      set = 'var t = this.tuple; var cell = this.cell;';

  all.forEach(function(a) {
    if (a.idx < 0) {
      ctr = a.init + ctr;
      add = a.add + add;
      rem = a.rem + rem;
    } else {
      ctr += a.init;
      add += a.add;
      rem += a.rem;
    }
  });
  agg.slice()
    .sort(function(a, b) { return a.idx - b.idx; })
    .forEach(function(a) {
      set += 'this.assign(t,\''+a.out+'\','+a.set+');';
    });
  set += 'return t;';

  /* jshint evil: true */
  ctr = Function('cell', 't', ctr);
  ctr.prototype.assign = mutator;
  ctr.prototype.add = Function('t', 'var v = this.get(t);' + add);
  ctr.prototype.rem = Function('t', 'var v = this.get(t);' + rem);
  ctr.prototype.set = Function(set);
  ctr.prototype.get = accessor;
  ctr.prototype.distinct = __webpack_require__("uHQN").count.distinct;
  ctr.prototype.isValid = util.isValid;
  ctr.fields = agg.map(util.$('out'));
  return ctr;
}

types.create = create;
module.exports = types;


/***/ }),

/***/ "2zc7":
/***/ (function(module, exports, __webpack_require__) {

var DOM = __webpack_require__("sV93"),
    Handler = __webpack_require__("VeBo"),
    marks = __webpack_require__("kC7m");

function CanvasHandler() {
  Handler.call(this);
  this._down = null;
  this._touch = null;
  this._first = true;
}

var base = Handler.prototype;
var prototype = (CanvasHandler.prototype = Object.create(base));
prototype.constructor = CanvasHandler;

prototype.initialize = function(el, pad, obj) {
  // add event listeners
  var canvas = this._canvas = DOM.find(el, 'canvas');
  if (canvas) {
    var that = this;
    this.events.forEach(function(type) {
      canvas.addEventListener(type, function(evt) {
        if (prototype[type]) {
          prototype[type].call(that, evt);
        } else {
          that.fire(type, evt);
        }
      });
    });
  }

  return base.initialize.call(this, el, pad, obj);
};

prototype.canvas = function() {
  return this._canvas;
};

// retrieve the current canvas context
prototype.context = function() {
  return this._canvas.getContext('2d');
};

// supported events
prototype.events = [
  'keydown',
  'keypress',
  'keyup',
  'dragenter',
  'dragleave',
  'dragover',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseout',
  'mouseover',
  'click',
  'dblclick',
  'wheel',
  'mousewheel',
  'touchstart',
  'touchmove',
  'touchend'
];

// to keep firefox happy
prototype.DOMMouseScroll = function(evt) {
  this.fire('mousewheel', evt);
};

function move(moveEvent, overEvent, outEvent) {
  return function(evt) {
    var a = this._active,
        p = this.pickEvent(evt);

    if (p === a) {
      // active item and picked item are the same
      this.fire(moveEvent, evt); // fire move
    } else {
      // active item and picked item are different
      this.fire(outEvent, evt);  // fire out for prior active item
      this._active = p;            // set new active item
      this.fire(overEvent, evt); // fire over for new active item
      this.fire(moveEvent, evt); // fire move for new active item
    }
  };
}

function inactive(type) {
  return function(evt) {
    this.fire(type, evt);
    this._active = null;
  };
}

prototype.mousemove = move('mousemove', 'mouseover', 'mouseout');
prototype.dragover  = move('dragover', 'dragenter', 'dragleave');

prototype.mouseout  = inactive('mouseout');
prototype.dragleave = inactive('dragleave');

prototype.mousedown = function(evt) {
  this._down = this._active;
  this.fire('mousedown', evt);
};

prototype.click = function(evt) {
  if (this._down === this._active) {
    this.fire('click', evt);
    this._down = null;
  }
};

prototype.touchstart = function(evt) {
  this._touch = this.pickEvent(evt.changedTouches[0]);

  if (this._first) {
    this._active = this._touch;
    this._first = false;
  }

  this.fire('touchstart', evt, true);
};

prototype.touchmove = function(evt) {
  this.fire('touchmove', evt, true);
};

prototype.touchend = function(evt) {
  this.fire('touchend', evt, true);
  this._touch = null;
};

// fire an event
prototype.fire = function(type, evt, touch) {
  var a = touch ? this._touch : this._active,
      h = this._handlers[type], i, len;
  if (h) {
    evt.vegaType = type;
    for (i=0, len=h.length; i<len; ++i) {
      h[i].handler.call(this._obj, evt, a);
    }
  }
};

// add an event handler
prototype.on = function(type, handler) {
  var name = this.eventName(type),
      h = this._handlers;
  (h[name] || (h[name] = [])).push({
    type: type,
    handler: handler
  });
  return this;
};

// remove an event handler
prototype.off = function(type, handler) {
  var name = this.eventName(type),
      h = this._handlers[name], i;
  if (!h) return;
  for (i=h.length; --i>=0;) {
    if (h[i].type !== type) continue;
    if (!handler || h[i].handler === handler) h.splice(i, 1);
  }
  return this;
};

prototype.pickEvent = function(evt) {
  var rect = this._canvas.getBoundingClientRect(),
      pad = this._padding, x, y;
  return this.pick(this._scene,
    x = (evt.clientX - rect.left),
    y = (evt.clientY - rect.top),
    x - pad.left, y - pad.top);
};

// find the scenegraph item at the current mouse position
// x, y -- the absolute x, y mouse coordinates on the canvas element
// gx, gy -- the relative coordinates within the current group
prototype.pick = function(scene, x, y, gx, gy) {
  var g = this.context(),
      mark = marks[scene.marktype];
  return mark.pick.call(this, g, scene, x, y, gx, gy);
};

module.exports = CanvasHandler;


/***/ }),

/***/ "3C/O":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    Tuple = __webpack_require__("gtuQ"),
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Voronoi(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    clipExtent: {type: 'array<value>', default: __webpack_require__("MRce").extent},
    x: {type: 'field', default: 'layout_x'},
    y: {type: 'field', default: 'layout_y'}
  });

  this._layout = d3.geom.voronoi();
  this._output = {'path': 'layout_path'};

  return this.mutates(true);
}

var prototype = (Voronoi.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Voronoi;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['voronoi']);

  // get variables
  var pathname = this._output.path;

  // configure layout
  var polygons = this._layout
    .clipExtent(this.param('clipExtent'))
    .x(this.param('x').accessor)
    .y(this.param('y').accessor)
    (data);

  // build and assign path strings
  for (var i=0; i<data.length; ++i) {
    if (polygons[i]) Tuple.set(data[i], pathname, 'M' + polygons[i].join('L') + 'Z');
  }

  // return changeset
  input.fields[pathname] = 1;
  return input;
};

module.exports = Voronoi;

Voronoi.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Voronoi transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["voronoi"]},
    "clipExtent": {
      "description": "The min and max points at which to clip the voronoi diagram.",
      "oneOf": [
        {
          "type": "array",
          "items": {
            "oneOf": [
              {
                "type": "array",
                "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
                "minItems": 2,
                "maxItems": 2
              },
              {"$ref": "#/refs/signal"}
            ]
          },
          "minItems": 2,
          "maxItems": 2
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": [[-1e5,-1e5],[1e5,1e5]]
    },
    "x": {
      "description": "The input x coordinates.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "y": {
      "description": "The input y coordinates.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "path": {"type": "string", "default": "layout_path"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "3FFs":
/***/ (function(module, exports, __webpack_require__) {

var DEPS = __webpack_require__("D3vM").ALL,
    nodeID = 0;

function Node(graph) {
  if (graph) this.init(graph);
}

var Flags = Node.Flags = {
  Router:     0x01, // Responsible for propagating tuples, cannot be skipped.
  Collector:  0x02, // Holds a materialized dataset, pulse node to reflow.
  Produces:   0x04, // Produces new tuples. 
  Mutates:    0x08, // Sets properties of incoming tuples.
  Reflows:    0x10, // Forwards a reflow pulse.
  Batch:      0x20  // Performs batch data processing, needs collector.
};

var prototype = Node.prototype;

prototype.init = function(graph) {
  this._id = ++nodeID;
  this._graph = graph;
  this._rank  = graph.rank(); // Topological sort by rank
  this._qrank = null; // Rank when enqueued for propagation
  this._stamp = 0;    // Last stamp seen

  this._listeners = [];
  this._listeners._ids = {}; // To prevent duplicate listeners

  // Initialize dependencies.
  this._deps = {};
  for (var i=0, n=DEPS.length; i<n; ++i) {
    this._deps[DEPS[i]] = [];
  }

  // Initialize status flags.
  this._flags = 0;

  return this;
};

prototype.rank = function() {
  return this._rank;
};

prototype.rerank = function() {
  var g = this._graph, 
      q = [this],
      cur;

  while (q.length) {
    cur = q.shift();
    cur._rank = g.rank();
    q.unshift.apply(q, cur.listeners());
  }

  return this;
};

prototype.qrank = function(/* set */) {
  if (!arguments.length) return this._qrank;
  return (this._qrank = this._rank, this);
};

prototype.last = function(stamp) { 
  if (!arguments.length) return this._stamp;
  return (this._stamp = stamp, this);
};

// -- status flags ---

prototype._setf = function(v, b) {
  if (b) { this._flags |= v; } else { this._flags &= ~v; }
  return this;
};

prototype.router = function(state) {
  if (!arguments.length) return (this._flags & Flags.Router);
  return this._setf(Flags.Router, state);
};

prototype.collector = function(state) {
  if (!arguments.length) return (this._flags & Flags.Collector);
  return this._setf(Flags.Collector, state);
};

prototype.produces = function(state) {
  if (!arguments.length) return (this._flags & Flags.Produces);
  return this._setf(Flags.Produces, state);
};

prototype.mutates = function(state) {
  if (!arguments.length) return (this._flags & Flags.Mutates);
  return this._setf(Flags.Mutates, state);
};

prototype.reflows = function(state) {
  if (!arguments.length) return (this._flags & Flags.Reflows);
  return this._setf(Flags.Reflows, state);
};

prototype.batch = function(state) {
  if (!arguments.length) return (this._flags & Flags.Batch);
  return this._setf(Flags.Batch, state);
};

prototype.dependency = function(type, deps) {
  var d = this._deps[type],
      n = d._names || (d._names = {});  // To prevent dupe deps

  // Get dependencies of the given type
  if (arguments.length === 1) {
    return d;
  }

  if (deps === null) {
    // Clear dependencies of the given type
    d.splice(0, d.length);
    d._names = {};
  } else if (!Array.isArray(deps)) {
    // Separate this case to avoid cost of array creation
    if (n[deps]) return this;
    d.push(deps);
    n[deps] = 1;
  } else {
    for (var i=0, len=deps.length, dep; i<len; ++i) {
      dep = deps[i];
      if (n[dep]) continue;
      d.push(dep);
      n[dep] = 1;
    }
  }

  return this;
};

prototype.listeners = function() {
  return this._listeners;
};

prototype.addListener = function(l) {
  if (!(l instanceof Node)) {
    throw Error('Listener is not a Node');
  }
  if (this._listeners._ids[l._id]) return this;

  this._listeners.push(l);
  this._listeners._ids[l._id] = 1;
  if (this._rank > l._rank) {
    l.rerank();
  }

  return this;
};

prototype.removeListener = function(l) {
  if (!this._listeners._ids[l._id]) return false;
  
  var idx = this._listeners.indexOf(l),
      b = idx >= 0;

  if (b) {
    this._listeners.splice(idx, 1);
    this._listeners._ids[l._id] = null;
  }
  return b;
};

prototype.disconnect = function() {
  this._listeners = [];
  this._listeners._ids = {};
};

// Evaluate this dataflow node for the current pulse.
// Subclasses should override to perform custom processing.
prototype.evaluate = function(pulse) {
  return pulse;
};

// Should this node be re-evaluated for the current pulse?
// Searches pulse to see if any dependencies have updated.
prototype.reevaluate = function(pulse) {
  var prop, dep, i, n, j, m;

  for (i=0, n=DEPS.length; i<n; ++i) {
    prop = DEPS[i];
    dep = this._deps[prop];
    for (j=0, m=dep.length; j<m; ++j) {
      if (pulse[prop][dep[j]]) return true;
    }
  }

  return false;
};

Node.reset = function() { nodeID = 0; };

module.exports = Node;


/***/ }),

/***/ "3Gpk":
/***/ (function(module, exports, __webpack_require__) {

var bound = __webpack_require__("BONk");

var sets = [
  'items',
  'axisItems',
  'legendItems'
];

var keys = [
  'marktype', 'name', 'interactive', 'clip',
  'items', 'axisItems', 'legendItems', 'layer',
  'x', 'y', 'width', 'height', 'align', 'baseline',             // layout
  'fill', 'fillOpacity', 'opacity',                             // fill
  'stroke', 'strokeOpacity', 'strokeWidth', 'strokeCap',        // stroke
  'strokeDash', 'strokeDashOffset',                             // stroke dash
  'startAngle', 'endAngle', 'innerRadius', 'outerRadius',       // arc
  'interpolate', 'tension', 'orient',                           // area, line
  'url',                                                        // image
  'path',                                                       // path
  'x2', 'y2',                                                   // rule
  'size', 'shape',                                              // symbol
  'text', 'angle', 'theta', 'radius', 'dx', 'dy',               // text
  'font', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant'  // font
];

function toJSON(scene, indent) {
  return JSON.stringify(scene, keys, indent);
}

function fromJSON(json) {
  var scene = (typeof json === 'string' ? JSON.parse(json) : json);
  return initialize(scene);
}

function initialize(scene) {
  var type = scene.marktype,
      i, n, s, m, items;

  for (s=0, m=sets.length; s<m; ++s) {
    if ((items = scene[sets[s]])) {
      for (i=0, n=items.length; i<n; ++i) {
        items[i][type ? 'mark' : 'group'] = scene;
        if (!type || type === 'group') {
          initialize(items[i]);
        }
      }
    }
  }

  if (type) bound.mark(scene);
  return scene;
}

module.exports = {
  toJSON:   toJSON,
  fromJSON: fromJSON
};

/***/ }),

/***/ "3Scv":
/***/ (function(module, exports) {

function size(item) {
  return item.fontSize != null ? item.fontSize : 11;
}

module.exports = {
  size: size,
  value: function(s) {
    return s != null ? String(s) : '';
  },
  font: function(item, quote) {
    var font = item.font;
    if (quote && font) {
      font = String(font).replace(/\"/g, '\'');
    }
    return '' +
      (item.fontStyle ? item.fontStyle + ' ' : '') +
      (item.fontVariant ? item.fontVariant + ' ' : '') +
      (item.fontWeight ? item.fontWeight + ' ' : '') +
      size(item) + 'px ' +
      (font || 'sans-serif');
  },
  offset: function(item) {
    // perform our own font baseline calculation
    // why? not all browsers support SVG 1.1 'alignment-baseline' :(
    var baseline = item.baseline,
        h = size(item);
    return Math.round(
      baseline === 'top'    ?  0.93*h :
      baseline === 'middle' ?  0.30*h :
      baseline === 'bottom' ? -0.21*h : 0
    );
  }
};


/***/ }),

/***/ "3Y21":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    log = __webpack_require__("J731"),
    ChangeSet = df.ChangeSet,
    Tuple = df.Tuple,
    Deps = df.Dependencies,
    Transform = __webpack_require__("4JPs"),
    Facetor = __webpack_require__("QvNu");

function Aggregate(graph) {
  Transform.prototype.init.call(this, graph);

  Transform.addParameters(this, {
    groupby: {type: 'array<field>'},
    summarize: {
      type: 'custom',
      set: function(summarize) {
        var signalDeps = {},
            tx = this._transform,
            i, len, f, fields, name, ops;

        if (!dl.isArray(fields = summarize)) { // Object syntax from dl
          fields = [];
          for (name in summarize) {
            ops = dl.array(summarize[name]);
            fields.push({field: name, ops: ops});
          }
        }

        function sg(x) { if (x.signal) signalDeps[x.signal] = 1; }

        for (i=0, len=fields.length; i<len; ++i) {
          f = fields[i];
          if (f.field.signal) { signalDeps[f.field.signal] = 1; }
          dl.array(f.ops).forEach(sg);
          dl.array(f.as).forEach(sg);
        }

        tx._fields = fields;
        tx._aggr = null;
        tx.dependency(Deps.SIGNALS, dl.keys(signalDeps));
        return tx;
      }
    }
  });

  this._aggr  = null; // dl.Aggregator
  this._input = null; // Used by Facetor._on_keep.
  this._args  = null; // To cull re-computation.
  this._fields = [];
  this._out = [];

  this._type = TYPES.TUPLE;
  this._acc = {groupby: dl.true, value: dl.true};

  return this.router(true).produces(true);
}

var prototype = (Aggregate.prototype = Object.create(Transform.prototype));
prototype.constructor = Aggregate;

var TYPES = Aggregate.TYPES = {
  VALUE: 1,
  TUPLE: 2,
  MULTI: 3
};

Aggregate.VALID_OPS = [
  'values', 'count', 'valid', 'missing', 'distinct',
  'sum', 'mean', 'average', 'variance', 'variancep', 'stdev',
  'stdevp', 'median', 'q1', 'q3', 'modeskew', 'min', 'max',
  'argmin', 'argmax'
];

prototype.type = function(type) {
  return (this._type = type, this);
};

prototype.accessors = function(groupby, value) {
  var acc = this._acc;
  acc.groupby = dl.$(groupby) || dl.true;
  acc.value = dl.$(value) || dl.true;
};

prototype.aggr = function() {
  if (this._aggr) return this._aggr;

  var g = this._graph,
      hasGetter = false,
      args = [],
      groupby = this.param('groupby').field,
      value = function(x) { return x.signal ? g.signalRef(x.signal) : x; };

  // Prepare summarize fields.
  var fields = this._fields.map(function(f) {
    var field = {
      name: value(f.field),
      as:   dl.array(f.as),
      ops:  dl.array(value(f.ops)).map(value),
      get:  f.get
    };
    hasGetter = hasGetter || field.get != null;
    args.push(field.name);
    return field;
  });

  // If there is an arbitrary getter, all bets are off.
  // Otherwise, we can check argument fields to cull re-computation.
  groupby.forEach(function(g) {
    if (g.get) hasGetter = true;
    args.push(g.name || g);
  });
  this._args = hasGetter || !fields.length ? null : args;

  if (!fields.length) fields = {'*': 'values'};

  // Instantiate our aggregator instance.
  // Facetor is a special subclass that can facet into data pipelines.
  var aggr = this._aggr = new Facetor()
    .groupby(groupby)
    .stream(true)
    .summarize(fields);

  // Collect output fields sets by this aggregate.
  this._out = getFields(aggr);

  // If we are processing tuples, key them by '_id'.
  if (this._type !== TYPES.VALUE) { aggr.key('_id'); }

  return aggr;
};

function getFields(aggr) {
  // Collect the output fields set by this aggregate.
  var f = [], i, n, j, m, dims, vals, meas;

  dims = aggr._dims;
  for (i=0, n=dims.length; i<n; ++i) {
    f.push(dims[i].name);
  }

  vals = aggr._aggr;
  for (i=0, n=vals.length; i<n; ++i) {
    meas = vals[i].measures.fields;
    for (j=0, m=meas.length; j<m; ++j) {
      f.push(meas[j]);
    }
  }

  return f;
}

prototype.transform = function(input, reset) {
  log.debug(input, ['aggregate']);

  var output = ChangeSet.create(input),
      aggr = this.aggr(),
      out = this._out,
      args = this._args,
      reeval = true,
      p = Tuple.prev,
      add, rem, mod, mark, i;

  // Upon reset, retract prior tuples and re-initialize.
  if (reset) {
    output.rem.push.apply(output.rem, aggr.result());
    aggr.clear();
    this._aggr = null;
    aggr = this.aggr();
  }

  // Get update methods according to input type.
  if (this._type === TYPES.TUPLE) {
    add  = function(x) { aggr._add(x); Tuple.prev_init(x); };
    rem  = function(x) { aggr._rem(p(x)); };
    mod  = function(x) { aggr._mod(x, p(x)); };
    mark = function(x) { aggr._markMod(x, p(x)); };
  } else {
    var gby = this._acc.groupby,
        val = this._acc.value,
        get = this._type === TYPES.VALUE ? val : function(x) {
          return { _id: x._id, groupby: gby(x), value: val(x) };
        };
    add  = function(x) { aggr._add(get(x)); Tuple.prev_init(x); };
    rem  = function(x) { aggr._rem(get(p(x))); };
    mod  = function(x) { aggr._mod(get(x), get(p(x))); };
    mark = function(x) { aggr._mark(get(x), get(p(x))); };
  }

  input.add.forEach(add);
  if (reset) {
    // A signal change triggered reflow. Add everything.
    // No need for rem, we cleared the aggregator.
    input.mod.forEach(add);
  } else {
    input.rem.forEach(rem);

    // If possible, check argument fields to see if we need to re-process mods.
    if (args) for (i=0, reeval=false; i<args.length; ++i) {
      if (input.fields[args[i]]) { reeval = true; break; }
    }
    input.mod.forEach(reeval ? mod : mark);
  }

  // Indicate output fields and return aggregate tuples.
  for (i=0; i<out.length; ++i) {
    output.fields[out[i]] = 1;
  }
  return (aggr._input = input, aggr.changes(output));
};

module.exports = Aggregate;

var VALID_OPS = Aggregate.VALID_OPS;

Aggregate.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Aggregate transform",
  "description": "Compute summary aggregate statistics",
  "type": "object",
  "properties": {
    "type": {"enum": ["aggregate"]},
    "groupby": {
      "type": "array",
      "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]},
      "description": "A list of fields to split the data into groups."
    },
    "summarize": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": {
            "type": "array",
            "description": "An array of aggregate functions.",
            "items": {"oneOf": [{"enum": VALID_OPS}, {"$ref": "#/refs/signal"}]}
          }
        },
        {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "field": {
                "description": "The name of the field to aggregate.",
                "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
              },
              "ops": {
                "type": "array",
                "description": "An array of aggregate functions.",
                "items": {"oneOf": [{"enum": VALID_OPS}, {"$ref": "#/refs/signal"}]}
              },
              "as": {
                "type": "array",
                "description": "An optional array of names to use for the output fields.",
                "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
              }
            },
            "additionalProperties": false,
            "required": ["field", "ops"]
          }
        }
      ]
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "3bKu":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    time = __webpack_require__("mgrV"),
    utc = time.utc;

var u = module.exports;

u.$year   = util.$func('year', time.year.unit);
u.$month  = util.$func('month', time.months.unit);
u.$date   = util.$func('date', time.dates.unit);
u.$day    = util.$func('day', time.weekdays.unit);
u.$hour   = util.$func('hour', time.hours.unit);
u.$minute = util.$func('minute', time.minutes.unit);
u.$second = util.$func('second', time.seconds.unit);

u.$utcYear   = util.$func('utcYear', utc.year.unit);
u.$utcMonth  = util.$func('utcMonth', utc.months.unit);
u.$utcDate   = util.$func('utcDate', utc.dates.unit);
u.$utcDay    = util.$func('utcDay', utc.weekdays.unit);
u.$utcHour   = util.$func('utcHour', utc.hours.unit);
u.$utcMinute = util.$func('utcMinute', utc.minutes.unit);
u.$utcSecond = util.$func('utcSecond', utc.seconds.unit);


/***/ }),

/***/ "4JPs":
/***/ (function(module, exports, __webpack_require__) {

var df = __webpack_require__("Hqva"),
    Base = df.Node.prototype, // jshint ignore:line
    Deps = df.Dependencies,
    Parameter = __webpack_require__("fRRI");

function Transform(graph) {
  if (graph) Base.init.call(this, graph);
}

Transform.addParameters = function(proto, params) {
  proto._parameters = proto._parameters || {};
  for (var name in params) {
    var p = params[name],
        param = new Parameter(name, p.type, proto);

    proto._parameters[name] = param;

    if (p.type === 'custom') {
      if (p.set) param.set = p.set.bind(param);
      if (p.get) param.get = p.get.bind(param);
    }

    if (p.hasOwnProperty('default')) param.set(p.default);
  }
};

var prototype = (Transform.prototype = Object.create(Base));
prototype.constructor = Transform;

prototype.param = function(name, value) {
  var param = this._parameters[name];
  return (param === undefined) ? this :
    (arguments.length === 1) ? param.get() : param.set(value);
};

// Perform transformation. Subclasses should override.
prototype.transform = function(input/*, reset */) {
  return input;
};

prototype.evaluate = function(input) {
  // Many transforms store caches that must be invalidated if
  // a signal value has changed.
  var reset = this._stamp < input.stamp &&
    this.dependency(Deps.SIGNALS).reduce(function(c, s) {
      return c += input.signals[s] ? 1 : 0;
    }, 0);
  return this.transform(input, reset);
};

prototype.output = function(map) {
  for (var key in this._output) {
    if (map[key] !== undefined) {
      this._output[key] = map[key];
    }
  }
  return this;
};

module.exports = Transform;


/***/ }),

/***/ "4XOj":
/***/ (function(module, exports, __webpack_require__) {

function toMap(list) {
  var map = {}, i, n;
  for (i=0, n=list.length; i<n; ++i) map[list[i]] = 1;
  return map;
}

function keys(object) {
  var list = [], k;
  for (k in object) list.push(k);
  return list;
}

module.exports = function(opt) {
  opt = opt || {};
  var constants = opt.constants || __webpack_require__("MSrK"),
      functions = (opt.functions || __webpack_require__("nj7R"))(codegen),
      functionDefs = opt.functionDefs ? opt.functionDefs(codegen) : {},
      idWhiteList = opt.idWhiteList ? toMap(opt.idWhiteList) : null,
      idBlackList = opt.idBlackList ? toMap(opt.idBlackList) : null,
      memberDepth = 0,
      FIELD_VAR = opt.fieldVar || 'datum',
      GLOBAL_VAR = opt.globalVar || 'signals',
      globals = {},
      fields = {},
      dataSources = {};

  function codegen_wrap(ast) {
    var retval = {
      code: codegen(ast),
      globals: keys(globals),
      fields: keys(fields),
      dataSources: keys(dataSources),
      defs: functionDefs
    };
    globals = {};
    fields = {};
    dataSources = {};
    return retval;
  }

  /* istanbul ignore next */
  var lookupGlobal = typeof GLOBAL_VAR === 'function' ? GLOBAL_VAR :
    function (id) {
      return GLOBAL_VAR + '["' + id + '"]';
    };

  function codegen(ast) {
    if (typeof ast === 'string') return ast;
    var generator = CODEGEN_TYPES[ast.type];
    if (generator == null) {
      throw new Error('Unsupported type: ' + ast.type);
    }
    return generator(ast);
  }

  var CODEGEN_TYPES = {
    'Literal': function(n) {
        return n.raw;
      },
    'Identifier': function(n) {
        var id = n.name;
        if (memberDepth > 0) {
          return id;
        }
        if (constants.hasOwnProperty(id)) {
          return constants[id];
        }
        if (idWhiteList) {
          if (idWhiteList.hasOwnProperty(id)) {
            return id;
          } else {
            globals[id] = 1;
            return lookupGlobal(id);
          }
        }
        if (idBlackList && idBlackList.hasOwnProperty(id)) {
          throw new Error('Illegal identifier: ' + id);
        }
        return id;
      },
    'Program': function(n) {
        return n.body.map(codegen).join('\n');
      },
    'MemberExpression': function(n) {
        var d = !n.computed;
        var o = codegen(n.object);
        if (d) memberDepth += 1;
        var p = codegen(n.property);
        if (o === FIELD_VAR) { fields[p] = 1; } // HACKish...
        if (d) memberDepth -= 1;
        return o + (d ? '.'+p : '['+p+']');
      },
    'CallExpression': function(n) {
        if (n.callee.type !== 'Identifier') {
          throw new Error('Illegal callee type: ' + n.callee.type);
        }
        var callee = n.callee.name;
        var args = n.arguments;
        var fn = functions.hasOwnProperty(callee) && functions[callee];
        if (!fn) throw new Error('Unrecognized function: ' + callee);
        return fn instanceof Function ?
          fn(args, globals, fields, dataSources) :
          fn + '(' + args.map(codegen).join(',') + ')';
      },
    'ArrayExpression': function(n) {
        return '[' + n.elements.map(codegen).join(',') + ']';
      },
    'BinaryExpression': function(n) {
        return '(' + codegen(n.left) + n.operator + codegen(n.right) + ')';
      },
    'UnaryExpression': function(n) {
        return '(' + n.operator + codegen(n.argument) + ')';
      },
    'ConditionalExpression': function(n) {
        return '(' + codegen(n.test) +
          '?' + codegen(n.consequent) +
          ':' + codegen(n.alternate) +
          ')';
      },
    'LogicalExpression': function(n) {
        return '(' + codegen(n.left) + n.operator + codegen(n.right) + ')';
      },
    'ObjectExpression': function(n) {
        return '{' + n.properties.map(codegen).join(',') + '}';
      },
    'Property': function(n) {
        memberDepth += 1;
        var k = codegen(n.key);
        memberDepth -= 1;
        return k + ':' + codegen(n.value);
      },
    'ExpressionStatement': function(n) {
        return codegen(n.expression);
      }
  };

  codegen_wrap.functions = functions;
  codegen_wrap.functionDefs = functionDefs;
  codegen_wrap.constants = constants;
  return codegen_wrap;
};


/***/ }),

/***/ "58eP":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Pie(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    field:      {type: 'field', default: null},
    startAngle: {type: 'value', default: 0},
    endAngle:   {type: 'value', default: 2 * Math.PI},
    sort:       {type: 'value', default: false}
  });

  this._output = {
    'start': 'layout_start',
    'end':   'layout_end',
    'mid':   'layout_mid'
  };

  return this.mutates(true);
}

var prototype = (Pie.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Pie;

function ones() { return 1; }

prototype.batchTransform = function(input, data) {
  log.debug(input, ['pie']);

  var output = this._output,
      field = this.param('field').accessor || ones,
      start = this.param('startAngle'),
      stop = this.param('endAngle'),
      sort = this.param('sort');

  var values = data.map(field),
      a = start,
      k = (stop - start) / dl.sum(values),
      index = dl.range(data.length),
      i, t, v;

  if (sort) {
    index.sort(function(a, b) {
      return values[a] - values[b];
    });
  }

  for (i=0; i<index.length; ++i) {
    t = data[index[i]];
    v = values[index[i]];
    Tuple.set(t, output.start, a);
    Tuple.set(t, output.mid, (a + 0.5 * v * k));
    Tuple.set(t, output.end, (a += v * k));
  }

  input.fields[output.start] = 1;
  input.fields[output.end] = 1;
  input.fields[output.mid] = 1;
  return input;
};

module.exports = Pie;

Pie.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Pie transform",
  "description": "Computes a pie chart layout.",
  "type": "object",
  "properties": {
    "type": {"enum": ["pie"]},
    "field": {
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "description": "The data values to encode as angular spans. " +
        "If this property is omitted, all pie slices will have equal spans."
    },
    "startAngle": {
      "oneOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 2 * Math.PI
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": 0
    },
    "endAngle": {
      "oneOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 2 * Math.PI
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": 2 * Math.PI,
    },
    "sort": {
      "description": " If true, will sort the data prior to computing angles.",
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "default": false
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "start": {"type": "string", "default": "layout_start"},
        "end": {"type": "string", "default": "layout_end"},
        "mid": {"type": "string", "default": "layout_mid"}
      }
    }
  },
  "required": ["type"]
};


/***/ }),

/***/ "5AQc":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");

// Matches absolute URLs with optional protocol
//   https://...    file://...    //...
var protocol_re = /^([A-Za-z]+:)?\/\//;

// Special treatment in node.js for the file: protocol
var fileProtocol = 'file://';

// Validate and cleanup URL to ensure that it is allowed to be accessed
// Returns cleaned up URL, or false if access is not allowed
function sanitizeUrl(opt) {
  var url = opt.url;
  if (!url && opt.file) { return fileProtocol + opt.file; }

  // In case this is a relative url (has no host), prepend opt.baseURL
  if (opt.baseURL && !protocol_re.test(url)) {
    if (!startsWith(url, '/') && opt.baseURL[opt.baseURL.length-1] !== '/') {
      url = '/' + url; // Ensure that there is a slash between the baseURL (e.g. hostname) and url
    }
    url = opt.baseURL + url;
  }
  // relative protocol, starts with '//'
  if (!load.useXHR && startsWith(url, '//')) {
    url = (opt.defaultProtocol || 'http') + ':' + url;
  }
  // If opt.domainWhiteList is set, only allows url, whose hostname
  // * Is the same as the origin (window.location.hostname)
  // * Equals one of the values in the whitelist
  // * Is a proper subdomain of one of the values in the whitelist
  if (opt.domainWhiteList) {
    var domain, origin;
    if (load.useXHR) {
      var a = document.createElement('a');
      a.href = url;
      // From http://stackoverflow.com/questions/736513/how-do-i-parse-a-url-into-hostname-and-path-in-javascript
      // IE doesn't populate all link properties when setting .href with a relative URL,
      // however .href will return an absolute URL which then can be used on itself
      // to populate these additional fields.
      if (a.host === '') {
        a.href = a.href;
      }
      domain = a.hostname.toLowerCase();
      origin = window.location.hostname;
    } else {
      // relative protocol is broken: https://github.com/defunctzombie/node-url/issues/5
      var parts = __webpack_require__(12).parse(url);
      domain = parts.hostname;
      origin = null;
    }

    if (origin !== domain) {
      var whiteListed = opt.domainWhiteList.some(function(d) {
        var idx = domain.length - d.length;
        return d === domain ||
          (idx > 1 && domain[idx-1] === '.' && domain.lastIndexOf(d) === idx);
      });
      if (!whiteListed) {
        throw 'URL is not whitelisted: ' + url;
      }
    }
  }
  return url;
}

function load(opt, callback) {
  return load.loader(opt, callback);
}

function loader(opt, callback) {
  var error = callback || function(e) { throw e; }, url;

  try {
    url = load.sanitizeUrl(opt); // enable override
  } catch (err) {
    error(err);
    return;
  }

  if (!url) {
    error('Invalid URL: ' + opt.url);
  } else if (load.useXHR) {
    // on client, use xhr
    return load.xhr(url, opt, callback);
  } else if (startsWith(url, fileProtocol)) {
    // on server, if url starts with 'file://', strip it and load from file
    return load.file(url.slice(fileProtocol.length), opt, callback);
  } else if (url.indexOf('://') < 0) { // TODO better protocol check?
    // on server, if no protocol assume file
    return load.file(url, opt, callback);
  } else {
    // for regular URLs on server
    return load.http(url, opt, callback);
  }
}

function xhrHasResponse(request) {
  var type = request.responseType;
  return type && type !== 'text' ?
    request.response : // null on error
    request.responseText; // '' on error
}

function xhr(url, opt, callback) {
  var async = !!callback;
  var request = new XMLHttpRequest();
  // If IE does not support CORS, use XDomainRequest (copied from d3.xhr)
  if (typeof XDomainRequest !== 'undefined' &&
      !('withCredentials' in request) &&
      /^(http(s)?:)?\/\//.test(url)) request = new XDomainRequest();

  function respond() {
    var status = request.status;
    if (!status && xhrHasResponse(request) || status >= 200 && status < 300 || status === 304) {
      callback(null, request.responseText);
    } else {
      callback(request, null);
    }
  }

  if (async) {
    if ('onload' in request) {
      request.onload = request.onerror = respond;
    } else {
      request.onreadystatechange = function() {
        if (request.readyState > 3) respond();
      };
    }
  }

  request.open('GET', url, async);
  /* istanbul ignore else */
  if (request.setRequestHeader) {
    var headers = util.extend({}, load.headers, opt.headers);
    for (var name in headers) {
      request.setRequestHeader(name, headers[name]);
    }
  }
  request.send();

  if (!async && xhrHasResponse(request)) {
    return request.responseText;
  }
}

function file(filename, opt, callback) {
  var fs = __webpack_require__(9);
  if (!callback) {
    return fs.readFileSync(filename, 'utf8');
  }
  fs.readFile(filename, callback);
}

function http(url, opt, callback) {
  var headers = util.extend({}, load.headers, opt.headers);

  var options = {url: url, encoding: null, gzip: true, headers: headers};
  if (!callback) {
    return __webpack_require__(11)('GET', url, options).getBody();
  }
  __webpack_require__(10)(options, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      callback(null, body);
    } else {
      error = error ||
        'Load failed with response code ' + response.statusCode + '.';
      callback(error, null);
    }
  });
}

function startsWith(string, searchString) {
  return string == null ? false : string.lastIndexOf(searchString, 0) === 0;
}

// Allow these functions to be overriden by the user of the library
load.loader = loader;
load.sanitizeUrl = sanitizeUrl;
load.xhr = xhr;
load.file = file;
load.http = http;

// Default settings
load.useXHR = (typeof XMLHttpRequest !== 'undefined');
load.headers = {};

module.exports = load;


/***/ }),

/***/ "6+LD":
/***/ (function(module, exports, __webpack_require__) {

var df = __webpack_require__("Hqva"),
    Tuple = df.Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function CountPattern(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    field:     {type: 'field', default: 'data'},
    pattern:   {type: 'value', default: '[\\w\']+'},
    case:      {type: 'value', default: 'lower'},
    stopwords: {type: 'value', default: ''}
  });

  this._output = {text: 'text', count: 'count'};

  return this.router(true).produces(true);
}

var prototype = (CountPattern.prototype = Object.create(Transform.prototype));
prototype.constructor = CountPattern;

prototype.transform = function(input, reset) {
  log.debug(input, ['countpattern']);

  var get = this.param('field').accessor,
      pattern = this.param('pattern'),
      stop = this.param('stopwords'),
      rem = false;

  // update parameters
  if (this._stop !== stop) {
    this._stop = stop;
    this._stop_re = new RegExp('^' + stop + '$', 'i');
    reset = true;
  }

  if (this._pattern !== pattern) {
    this._pattern = pattern;
    this._match = new RegExp(this._pattern, 'g');
    reset = true;
  }

  if (reset) this._counts = {};

  function curr(t) { return (Tuple.prev_init(t), get(t)); }
  function prev(t) { return get(Tuple.prev(t)); }

  this._add(input.add, curr);
  if (!reset) this._rem(input.rem, prev);
  if (reset || (rem = input.fields[get.field])) {
    if (rem) this._rem(input.mod, prev);
    this._add(input.mod, curr);
  }

  // generate output tuples
  return this._changeset(input);
};

prototype._changeset = function(input) {
  var counts = this._counts,
      tuples = this._tuples || (this._tuples = {}),
      change = df.ChangeSet.create(input),
      out = this._output, w, t, c;

  for (w in counts) {
    t = tuples[w];
    c = counts[w] || 0;
    if (!t && c) {
      tuples[w] = (t = Tuple.ingest({}));
      t[out.text] = w;
      t[out.count] = c;
      change.add.push(t);
    } else if (c === 0) {
      if (t) change.rem.push(t);
      delete counts[w];
      delete tuples[w];
    } else if (t[out.count] !== c) {
      Tuple.set(t, out.count, c);
      change.mod.push(t);
    }
  }
  return change;
};

prototype._tokenize = function(text) {
  switch (this.param('case')) {
    case 'upper': text = text.toUpperCase(); break;
    case 'lower': text = text.toLowerCase(); break;
  }
  return text.match(this._match);
};

prototype._add = function(tuples, get) {
  var counts = this._counts,
      stop = this._stop_re,
      tok, i, j, t;

  for (j=0; j<tuples.length; ++j) {
    tok = this._tokenize(get(tuples[j]));
    for (i=0; i<tok.length; ++i) {
      if (!stop.test(t=tok[i])) {
        counts[t] = 1 + (counts[t] || 0);
      }
    }
  }
};

prototype._rem = function(tuples, get) {
  var counts = this._counts,
      stop = this._stop_re,
      tok, i, j, t;

  for (j=0; j<tuples.length; ++j) {
    tok = this._tokenize(get(tuples[j]));
    for (i=0; i<tok.length; ++i) {
      if (!stop.test(t=tok[i])) {
        counts[t] -= 1;
      }
    }
  }
};

module.exports = CountPattern;

CountPattern.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "CountPattern transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["countpattern"]},
    "field": {
      "description": "The field containing the text to analyze.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": 'data'
    },
    "pattern": {
      "description": "A regexp pattern for matching words in text.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "[\\w\']+"
    },
    "case": {
      "description": "Text case transformation to apply.",
      "oneOf": [{"enum": ["lower", "upper", "none"]}, {"$ref": "#/refs/signal"}],
      "default": "lower"
    },
    "stopwords": {
      "description": "A regexp pattern for matching stopwords to omit.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": ""
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "text": {"type": "string", "default": "text"},
        "count": {"type": "string", "default": "count"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "6gf1":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    selector = __webpack_require__("XSKZ"),
    parseSignals = __webpack_require__("S/OH");

var GATEKEEPER = '_vgGATEKEEPER',
    EVALUATOR  = '_vgEVALUATOR';

var vgEvent = {
  getItem: function() { return this.item; },
  getGroup: function(name) {
    var group = name ? this.name[name] : this.group,
        mark = group && group.mark,
        interactive = mark && (mark.interactive || mark.interactive === undefined);
    return interactive ? group : {};
  },
  getXY: function(item) {
      var p = {x: this.x, y: this.y};
      if (typeof item === 'string') {
        item = this.name[item];
      }
      for (; item; item = item.mark && item.mark.group) {
        p.x -= item.x || 0;
        p.y -= item.y || 0;
      }
      return p;
    },
  getX: function(item) { return this.getXY(item).x; },
  getY: function(item) { return this.getXY(item).y; }
};

function parseStreams(view) {
  var model = view.model(),
      trueFn  = model.expr('true'),
      falseFn = model.expr('false'),
      spec    = model.defs().signals,
      registry = {handlers: {}, nodes: {}},
      internal = dl.duplicate(registry),  // Internal event processing
      external = dl.duplicate(registry);  // External event processing

  dl.array(spec).forEach(function(sig) {
    var signal = model.signal(sig.name);
    if (sig.expr) return;  // Cannot have an expr and stream definition.

    dl.array(sig.streams).forEach(function(stream) {
      var sel = selector.parse(stream.type),
          exp = model.expr(stream.expr);
      mergedStream(signal, sel, exp, stream);
    });
  });

  // We register the event listeners all together so that if multiple
  // signals are registered on the same event, they will receive the
  // new value on the same pulse.
  dl.keys(internal.handlers).forEach(function(type) {
    view.on(type, function(evt, item) {
      evt.preventDefault(); // stop text selection
      extendEvent(evt, item);
      fire(internal, type, (item && item.datum) || {}, (item && item.mark && item.mark.group && item.mark.group.datum) || {}, evt);
    });
  });

  // add external event listeners
  dl.keys(external.handlers).forEach(function(type) {
    if (typeof window === 'undefined') return; // No external support

    var h = external.handlers[type],
        t = type.split(':'), // --> no element pseudo-selectors
        elt = (t[0] === 'window') ? [window] :
              window.document.querySelectorAll(t[0]);

    function handler(evt) {
      extendEvent(evt);
      fire(external, type, d3.select(this).datum(), this.parentNode && d3.select(this.parentNode).datum(), evt);
    }

    for (var i=0; i<elt.length; ++i) {
      elt[i].addEventListener(t[1], handler);
    }

    h.elements = elt;
    h.listener = handler;
  });

  // remove external event listeners
  external.detach = function() {
    dl.keys(external.handlers).forEach(function(type) {
      var h = external.handlers[type],
          t = type.split(':'),
          elt = dl.array(h.elements);

      for (var i=0; i<elt.length; ++i) {
        elt[i].removeEventListener(t[1], h.listener);
      }
    });
  };

  // export detach method
  return external.detach;

  // -- helper functions -----

  function extendEvent(evt, item) {
    var mouse = d3.mouse((d3.event=evt, view.renderer().scene())),
        pad = view.padding(),
        names = {}, mark, group, i;

    if (item) {
      mark = item.mark;
      group = mark.marktype === 'group' ? item : mark.group;
      for (i=item; i!=null; i=i.mark.group) {
        if (i.mark.def.name) {
          names[i.mark.def.name] = i;
        }
      }
    }
    names.root = view.model().scene().items[0];

    evt.vg = Object.create(vgEvent);
    evt.vg.group = group;
    evt.vg.item = item || {};
    evt.vg.name = names;
    evt.vg.x = mouse[0] - pad.left;
    evt.vg.y = mouse[1] - pad.top;
  }

  function fire(registry, type, datum, parent, evt) {
    var handlers = registry.handlers[type],
        node = registry.nodes[type],
        cs = df.ChangeSet.create(null, true),
        filtered = false,
        val, i, n, h;

    function invoke(f) {
      return !f.fn(datum, parent, evt);
    }

    for (i=0, n=handlers.length; i<n; ++i) {
      h = handlers[i];
      filtered = h.filters.some(invoke);
      if (filtered) continue;

      val = h.exp.fn(datum, parent, evt);
      if (h.spec.scale) {
        val = parseSignals.scale(model, h.spec, val, datum, evt);
      }

      if (val !== h.signal.value() || h.signal.verbose()) {
        h.signal.value(val);
        cs.signals[h.signal.name()] = 1;
      }
    }

    model.propagate(cs, node);
  }

  function mergedStream(sig, selector, exp, spec) {
    selector.forEach(function(s) {
      if (s.event)       domEvent(sig, s, exp, spec);
      else if (s.signal) signal(sig, s, exp, spec);
      else if (s.start)  orderedStream(sig, s, exp, spec);
      else if (s.stream) {
        if (s.filters) s.stream.forEach(function(ms) {
          ms.filters = dl.array(ms.filters).concat(s.filters);
        });
        mergedStream(sig, s.stream, exp, spec);
      }
    });
  }

  function domEvent(sig, selector, exp, spec) {
    var evt = selector.event,
        name = selector.name,
        mark = selector.mark,
        target   = selector.target,
        filters  = dl.array(selector.filters),
        registry = target ? external : internal,
        type = target ? target+':'+evt : evt,
        node = registry.nodes[type] || (registry.nodes[type] = new df.Node(model)),
        handlers = registry.handlers[type] || (registry.handlers[type] = []);

    if (name) {
      filters.push('!!event.vg.name["' + name + '"]'); // Mimic event bubbling
    } else if (mark) {
      filters.push('event.vg.item.mark && event.vg.item.mark.marktype==='+dl.str(mark));
    }

    handlers.push({
      signal: sig,
      exp: exp,
      spec: spec,
      filters: filters.map(function(f) { return model.expr(f); })
    });

    node.addListener(sig);
  }

  function signal(sig, selector, exp, spec) {
    var n = sig.name(), s = model.signal(n+EVALUATOR, null);
    s.evaluate = function(input) {
      if (!input.signals[selector.signal]) return model.doNotPropagate;
      var val = exp.fn();
      if (spec.scale) {
        val = parseSignals.scale(model, spec, val);
      }

      if (val !== sig.value() || sig.verbose()) {
        sig.value(val);
        input.signals[n] = 1;
        input.reflow = true;
      }

      return input;
    };
    s.dependency(df.Dependencies.SIGNALS, selector.signal);
    s.addListener(sig);
    model.signal(selector.signal).addListener(s);
  }

  function orderedStream(sig, selector, exp, spec) {
    var name = sig.name(),
        gk = name + GATEKEEPER,
        middle  = selector.middle,
        filters = middle.filters || (middle.filters = []),
        gatekeeper = model.signal(gk) || model.signal(gk, false);

    // Register an anonymous signal to act as a gatekeeper. Its value is
    // true or false depending on whether the start or end streams occur.
    // The middle signal then simply filters for the gatekeeper's value.
    mergedStream(gatekeeper, [selector.start], trueFn, {});
    mergedStream(gatekeeper, [selector.end], falseFn, {});

    filters.push(gatekeeper.name());
    mergedStream(sig, [selector.middle], exp, spec);
  }
}

module.exports = parseStreams;
parseStreams.schema = {
  "defs": {
    "streams": {
      "type": "array",
      "items": {
        "type": "object",

        "properties": {
          "type": {"type": "string"},
          "expr": {"type": "string"},
          "scale": {"$ref": "#/refs/scopedScale"}
        },

        "additionalProperties": false,
        "required": ["type", "expr"]
      }
    }
  }
};


/***/ }),

/***/ "736r":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var fielddef_1 = __webpack_require__("o+e1");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var time_1 = __webpack_require__("wKIX");
var timeUnit;
(function (timeUnit) {
    function parse(model) {
        return model.reduce(function (timeUnitComponent, fieldDef, channel) {
            var ref = fielddef_1.field(fieldDef, { nofn: true, datum: true });
            if (fieldDef.type === type_1.TEMPORAL && fieldDef.timeUnit) {
                var hash = fielddef_1.field(fieldDef);
                timeUnitComponent[hash] = {
                    type: 'formula',
                    field: fielddef_1.field(fieldDef),
                    expr: time_1.parseExpression(fieldDef.timeUnit, ref)
                };
            }
            return timeUnitComponent;
        }, {});
    }
    timeUnit.parseUnit = parse;
    function parseFacet(model) {
        var timeUnitComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            util_1.extend(timeUnitComponent, childDataComponent.timeUnit);
            delete childDataComponent.timeUnit;
        }
        return timeUnitComponent;
    }
    timeUnit.parseFacet = parseFacet;
    function parseLayer(model) {
        var timeUnitComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (!childDataComponent.source) {
                util_1.extend(timeUnitComponent, childDataComponent.timeUnit);
                delete childDataComponent.timeUnit;
            }
        });
        return timeUnitComponent;
    }
    timeUnit.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.vals(component.timeUnit);
    }
    timeUnit.assemble = assemble;
})(timeUnit = exports.timeUnit || (exports.timeUnit = {}));
//# sourceMappingURL=timeunit.js.map

/***/ }),

/***/ "7YRp":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
function isUnionedDomain(domain) {
    if (!util_1.isArray(domain)) {
        return 'fields' in domain;
    }
    return false;
}
exports.isUnionedDomain = isUnionedDomain;
function isDataRefDomain(domain) {
    if (!util_1.isArray(domain)) {
        return 'data' in domain;
    }
    return false;
}
exports.isDataRefDomain = isDataRefDomain;
//# sourceMappingURL=vega.schema.js.map

/***/ }),

/***/ "7Zus":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/"),
    parse = __webpack_require__("eJnU"),
    render = __webpack_require__("bSC/");

function path(g, o) {
  if (o.path == null) return true;
  var p = o.pathCache || (o.pathCache = parse(o.path));
  render(g, p, o.x, o.y);
}

module.exports = {
  draw: util.drawAll(path),
  pick: util.pickPath(path)
};


/***/ }),

/***/ "7rLc":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony import */ var __WEBPACK_IMPORTED_MODULE_0__src_dispatch__ = __webpack_require__("jyAW");
/* harmony reexport (binding) */ __webpack_require__.d(__webpack_exports__, "dispatch", function() { return __WEBPACK_IMPORTED_MODULE_0__src_dispatch__["a"]; });



/***/ }),

/***/ 8:
/***/ (function(module, exports) {

/* (ignored) */

/***/ }),

/***/ "81R7":
/***/ (function(module, exports) {

module.exports = function(b) {
  function noop() { }
  function add(x,y) { b.add(x, y); }

  return {
    bounds: function(_) {
      if (!arguments.length) return b;
      return (b = _, this);
    },
    beginPath: noop,
    closePath: noop,
    moveTo: add,
    lineTo: add,
    quadraticCurveTo: function(x1, y1, x2, y2) {
      b.add(x1, y1);
      b.add(x2, y2);
    },
    bezierCurveTo: function(x1, y1, x2, y2, x3, y3) {
      b.add(x1, y1);
      b.add(x2, y2);
      b.add(x3, y3);
    }
  };
};


/***/ }),

/***/ "8NMF":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    config = {};

config.load = {
  // base url for loading external data files
  // used only for server-side operation
  baseURL: '',
  // Allows domain restriction when using data loading via XHR.
  // To enable, set it to a list of allowed domains
  // e.g., ['wikipedia.org', 'eff.org']
  domainWhiteList: false
};

// inset padding for automatic padding calculation
config.autopadInset = 5;

// extensible scale lookup table
// all d3.scale.* instances also supported
config.scale = {
  time: d3.time.scale,
  utc:  d3.time.scale.utc
};

// default rendering settings
config.render = {
  retina: true
};

// root scenegraph group
config.scene = {
  fill: undefined,
  fillOpacity: undefined,
  stroke: undefined,
  strokeOpacity: undefined,
  strokeWidth: undefined,
  strokeDash: undefined,
  strokeDashOffset: undefined
};

// default axis properties
config.axis = {
  layer: 'back',
  ticks: 10,
  padding: 3,
  axisColor: '#000',
  axisWidth: 1,
  gridColor: '#000',
  gridOpacity: 0.15,
  tickColor: '#000',
  tickLabelColor: '#000',
  tickWidth: 1,
  tickSize: 6,
  tickLabelFontSize: 11,
  tickLabelFont: 'sans-serif',
  titleColor: '#000',
  titleFont: 'sans-serif',
  titleFontSize: 11,
  titleFontWeight: 'bold',
  titleOffset: 'auto',
  titleOffsetAutoMin: 30,
  titleOffsetAutoMax: 10000,
  titleOffsetAutoMargin: 4
};

// default legend properties
config.legend = {
  orient: 'right',
  offset: 20,
  padding: 3, // padding between legend items and border
  margin: 2,  // extra margin between two consecutive legends
  gradientStrokeColor: '#888',
  gradientStrokeWidth: 1,
  gradientHeight: 16,
  gradientWidth: 100,
  labelColor: '#000',
  labelFontSize: 10,
  labelFont: 'sans-serif',
  labelAlign: 'left',
  labelBaseline: 'middle',
  labelOffset: 8,
  symbolShape: 'circle',
  symbolSize: 50,
  symbolColor: '#888',
  symbolStrokeWidth: 1,
  titleColor: '#000',
  titleFont: 'sans-serif',
  titleFontSize: 11,
  titleFontWeight: 'bold'
};

// default color values
config.color = {
  rgb: [128, 128, 128],
  lab: [50, 0, 0],
  hcl: [0, 0, 50],
  hsl: [0, 0, 0.5]
};

// default scale ranges
config.range = {
  category10:  d3.scale.category10().range(),
  category20:  d3.scale.category20().range(),
  category20b: d3.scale.category20b().range(),
  category20c: d3.scale.category20c().range(),
  shapes: [
    'circle',
    'cross',
    'diamond',
    'square',
    'triangle-down',
    'triangle-up'
  ]
};

module.exports = config;


/***/ }),

/***/ "8lgt":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var common_1 = __webpack_require__("MtYt");
var rule;
(function (rule) {
    function markType() {
        return 'rule';
    }
    rule.markType = markType;
    function properties(model) {
        var p = {};
        if (model.config().mark.orient === 'vertical') {
            if (model.has(channel_1.X)) {
                p.x = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X, { binSuffix: '_mid' })
                };
            }
            else {
                p.x = { value: 0 };
            }
            if (model.has(channel_1.Y)) {
                p.y = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y, { binSuffix: '_mid' })
                };
            }
            else {
                p.y = { field: { group: 'height' } };
            }
            if (model.has(channel_1.Y2)) {
                p.y2 = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y2, { binSuffix: '_mid' })
                };
            }
            else {
                p.y2 = { value: 0 };
            }
        }
        else {
            if (model.has(channel_1.Y)) {
                p.y = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y, { binSuffix: '_mid' })
                };
            }
            else {
                p.y = { value: 0 };
            }
            if (model.has(channel_1.X)) {
                p.x = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X, { binSuffix: '_mid' })
                };
            }
            else {
                p.x = { value: 0 };
            }
            if (model.has(channel_1.X2)) {
                p.x2 = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X2, { binSuffix: '_mid' })
                };
            }
            else {
                p.x2 = { field: { group: 'width' } };
            }
        }
        common_1.applyColorAndOpacity(p, model);
        if (model.has(channel_1.SIZE)) {
            p.strokeWidth = {
                scale: model.scaleName(channel_1.SIZE),
                field: model.field(channel_1.SIZE)
            };
        }
        else {
            p.strokeWidth = { value: sizeValue(model) };
        }
        return p;
    }
    rule.properties = properties;
    function sizeValue(model) {
        var fieldDef = model.fieldDef(channel_1.SIZE);
        if (fieldDef && fieldDef.value !== undefined) {
            return fieldDef.value;
        }
        return model.config().mark.ruleSize;
    }
    function labels(model) {
        return undefined;
    }
    rule.labels = labels;
})(rule = exports.rule || (exports.rule = {}));
//# sourceMappingURL=rule.js.map

/***/ }),

/***/ 9:
/***/ (function(module, exports) {

/* (ignored) */

/***/ }),

/***/ "9+55":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/");

function draw(g, scene, bounds) {
  if (!scene.items || !scene.items.length) return;

  var renderer = this,
      items = scene.items, o;

  for (var i=0, len=items.length; i<len; ++i) {
    o = items[i];
    if (bounds && !bounds.intersects(o.bounds))
      continue; // bounds check

    if (!(o.image && o.image.url === o.url)) {
      o.image = renderer.loadImage(o.url);
      o.image.url = o.url;
    }

    var x = o.x || 0,
        y = o.y || 0,
        w = o.width || (o.image && o.image.width) || 0,
        h = o.height || (o.image && o.image.height) || 0,
        opac;
    x = x - (o.align==='center' ? w/2 : o.align==='right' ? w : 0);
    y = y - (o.baseline==='middle' ? h/2 : o.baseline==='bottom' ? h : 0);

    if (o.image.loaded) {
      g.globalAlpha = (opac = o.opacity) != null ? opac : 1;
      g.drawImage(o.image, x, y, w, h);
    }
  }
}

module.exports = {
  draw: draw,
  pick: util.pick()
};

/***/ }),

/***/ "92+E":
/***/ (function(module, exports, __webpack_require__) {

var parseMark = __webpack_require__("SbOu"),
    parseProperties = __webpack_require__("h36N");

function parseRootMark(model, spec, width, height) {
  return {
    type:       'group',
    width:      width,
    height:     height,
    properties: defaults(spec.scene || {}, model),
    scales:     spec.scales  || [],
    axes:       spec.axes    || [],
    legends:    spec.legends || [],
    marks:      (spec.marks || []).map(function(m) { return parseMark(model, m, true); })
  };
}

var PROPERTIES = [
  'fill', 'fillOpacity', 'stroke', 'strokeOpacity',
  'strokeWidth', 'strokeDash', 'strokeDashOffset'
];

function defaults(spec, model) {
  var config = model.config().scene,
      props = {}, i, n, m, p, s;

  for (i=0, n=m=PROPERTIES.length; i<n; ++i) {
    p = PROPERTIES[i];
    if ((s=spec[p]) !== undefined) {
      props[p] = s.signal ? s : {value: s};
    } else if (config[p]) {
      props[p] = {value: config[p]};
    } else {
      --m;
    }
  }

  return m ? {update: parseProperties(model, 'group', props)} : {};
}

module.exports = parseRootMark;

parseRootMark.schema = {
  "defs": {
    "container": {
      "type": "object",
      "properties": {
        "scene": {
          "type": "object",
          "properties": {
            "fill": {
              "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
            },
            "fillOpacity": {
              "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
            },
            "stroke": {
              "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
            },
            "strokeOpacity": {
              "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
            },
            "strokeWidth": {
              "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
            },
            "strokeDash": {
              "oneOf": [
                {"type": "array", "items": {"type": "number"}}, 
                {"$ref": "#/refs/signal"}
              ]
            },
            "strokeDashOffset": {
              "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
            },
          }
        },
        "scales": {
          "type": "array",
          "items": {"$ref": "#/defs/scale"}
        },
        "axes": {
          "type": "array",
          "items": {"$ref": "#/defs/axis"}
        },
        "legends": {
          "type": "array",
          "items": {"$ref": "#/defs/legend"}
        },
        "marks": {
          "type": "array",
          "items": {"oneOf":[{"$ref": "#/defs/groupMark"}, {"$ref": "#/defs/visualMark"}]}
        }
      }
    },


    "groupMark": {
      "allOf": [
        {
          "properties": { "type": {"enum": ["group"]} },
          "required": ["type"]
        },
        {"$ref": "#/defs/mark"},
        {"$ref": "#/defs/container"}
      ]
    },

    "visualMark": {
      "allOf": [
        {
          "not": { "properties": { "type": {"enum": ["group"]} } },
        },
        {"$ref": "#/defs/mark"}
      ]
    }
  }
};


/***/ }),

/***/ "95dH":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  Handler:  __webpack_require__("yszh"),
  Renderer: __webpack_require__("mP8n"),
  string: {
    Renderer : __webpack_require__("9eLo")
  }
};

/***/ }),

/***/ "9eLo":
/***/ (function(module, exports, __webpack_require__) {

var Renderer = __webpack_require__("ZyfV"),
    ImageLoader = __webpack_require__("zLl/"),
    SVG = __webpack_require__("zhsD"),
    text = __webpack_require__("3Scv"),
    DOM = __webpack_require__("sV93"),
    openTag = DOM.openTag,
    closeTag = DOM.closeTag,
    MARKS = __webpack_require__("rfWk");

function SVGStringRenderer(loadConfig) {
  Renderer.call(this);

  this._loader = new ImageLoader(loadConfig);

  this._text = {
    head: '',
    root: '',
    foot: '',
    defs: '',
    body: ''
  };

  this._defs = {
    clip_id:  1,
    gradient: {},
    clipping: {}
  };
}

var base = Renderer.prototype;
var prototype = (SVGStringRenderer.prototype = Object.create(base));
prototype.constructor = SVGStringRenderer;

prototype.resize = function(width, height, padding) {
  base.resize.call(this, width, height, padding);
  var p = this._padding,
      t = this._text;

  var attr = {
    'class':  'marks',
    'width':  this._width + p.left + p.right,
    'height': this._height + p.top + p.bottom,
  };
  for (var key in SVG.metadata) {
    attr[key] = SVG.metadata[key];
  }

  t.head = openTag('svg', attr);
  t.root = openTag('g', {
    transform: 'translate(' + p.left + ',' + p.top + ')'
  });
  t.foot = closeTag('g') + closeTag('svg');

  return this;
};

prototype.svg = function() {
  var t = this._text;
  return t.head + t.defs + t.root + t.body + t.foot;
};

prototype.render = function(scene) {
  this._text.body = this.mark(scene);
  this._text.defs = this.buildDefs();
  return this;
};

prototype.reset = function() {
  this._defs.clip_id = 0;
  return this;
};

prototype.buildDefs = function() {
  var all = this._defs,
      defs = '',
      i, id, def, stops;

  for (id in all.gradient) {
    def = all.gradient[id];
    stops = def.stops;

    defs += openTag('linearGradient', {
      id: id,
      x1: def.x1,
      x2: def.x2,
      y1: def.y1,
      y2: def.y2
    });
    
    for (i=0; i<stops.length; ++i) {
      defs += openTag('stop', {
        offset: stops[i].offset,
        'stop-color': stops[i].color
      }) + closeTag('stop');
    }
    
    defs += closeTag('linearGradient');
  }
  
  for (id in all.clipping) {
    def = all.clipping[id];

    defs += openTag('clipPath', {id: id});

    defs += openTag('rect', {
      x: 0,
      y: 0,
      width: def.width,
      height: def.height
    }) + closeTag('rect');

    defs += closeTag('clipPath');
  }
  
  return (defs.length > 0) ? openTag('defs') + defs + closeTag('defs') : '';
};

prototype.imageURL = function(url) {
  return this._loader.imageURL(url);
};

var object;

function emit(name, value, ns, prefixed) {
  object[prefixed || name] = value;
}

prototype.attributes = function(attr, item) {
  object = {};
  attr(emit, item, this);
  return object;
};

prototype.mark = function(scene) {
  var mdef = MARKS[scene.marktype],
      tag  = mdef.tag,
      attr = mdef.attr,
      nest = mdef.nest || false,
      data = nest ?
          (scene.items && scene.items.length ? [scene.items[0]] : []) :
          (scene.items || []),
      defs = this._defs,
      str = '',
      style, i, item;

  if (tag !== 'g' && scene.interactive === false) {
    style = 'style="pointer-events: none;"';
  }

  // render opening group tag
  str += openTag('g', {
    'class': DOM.cssClass(scene)
  }, style);

  // render contained elements
  for (i=0; i<data.length; ++i) {
    item = data[i];
    style = (tag !== 'g') ? styles(item, scene, tag, defs) : null;
    str += openTag(tag, this.attributes(attr, item), style);
    if (tag === 'text') {
      str += escape_text(text.value(item.text));
    } else if (tag === 'g') {
      str += openTag('rect',
        this.attributes(mdef.background, item),
        styles(item, scene, 'bgrect', defs)) + closeTag('rect');
      str += this.markGroup(item);
    }
    str += closeTag(tag);
  }

  // render closing group tag
  return str + closeTag('g');
};

prototype.markGroup = function(scene) {
  var str = '',
      axes = scene.axisItems || [],
      items = scene.items || [],
      legends = scene.legendItems || [],
      j, m;

  for (j=0, m=axes.length; j<m; ++j) {
    if (axes[j].layer === 'back') {
      str += this.mark(axes[j]);
    }
  }
  for (j=0, m=items.length; j<m; ++j) {
    str += this.mark(items[j]);
  }
  for (j=0, m=axes.length; j<m; ++j) {
    if (axes[j].layer !== 'back') {
      str += this.mark(axes[j]);
    }
  }
  for (j=0, m=legends.length; j<m; ++j) {
    str += this.mark(legends[j]);
  }

  return str;
};

function styles(o, mark, tag, defs) {
  if (o == null) return '';
  var i, n, prop, name, value, s = '';

  if (tag === 'bgrect' && mark.interactive === false) {
    s += 'pointer-events: none;';
  }

  if (tag === 'text') {
    s += 'font: ' + text.font(o) + ';';
  }

  for (i=0, n=SVG.styleProperties.length; i<n; ++i) {
    prop = SVG.styleProperties[i];
    name = SVG.styles[prop];
    value = o[prop];

    if (value == null) {
      if (name === 'fill') {
        s += (s.length ? ' ' : '') + 'fill: none;';
      }
    } else {
      if (value.id) {
        // ensure definition is included
        defs.gradient[value.id] = value;
        value = 'url(#' + value.id + ')';
      }
      s += (s.length ? ' ' : '') + name + ': ' + value + ';';
    }
  }

  return s ? 'style="' + s + '"' : null;
}

function escape_text(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
}

module.exports = SVGStringRenderer;


/***/ }),

/***/ "ARV7":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    Heap = __webpack_require__("KfF0"),
    ChangeSet = __webpack_require__("ekYZ"),
    DataSource = __webpack_require__("xZ2+"),
    Collector = __webpack_require__("B1p+"),
    Tuple = __webpack_require__("gtuQ"),
    Signal = __webpack_require__("KMnl"),
    Deps = __webpack_require__("D3vM");

function Graph() {
}

var prototype = Graph.prototype;

prototype.init = function() {
  this._stamp = 0;
  this._rank  = 0;

  this._data = {};
  this._signals = {};
  this._requestedIndexes = {};

  this.doNotPropagate = {};
};

prototype.rank = function() {
  return ++this._rank;
};

prototype.values = function(type, names, hash) {
  var data = (type === Deps.SIGNALS ? this._signals : this._data),
      n = (names !== undefined ? names : dl.keys(data)),
      vals, i;

  if (Array.isArray(n)) {
    vals = hash || {};
    for (i=0; i<n.length; ++i) {
      vals[n[i]] = data[n[i]].values();
    }
    return vals;
  } else {
    return data[n].values();
  }
};

// Retain for backwards-compatibility
prototype.dataValues = function(names) {
  return this.values(Deps.DATA, names);
};

// Retain for backwards-compatibility
prototype.signalValues = function(names) {
  return this.values(Deps.SIGNALS, names);
};

prototype.data = function(name, pipeline, facet) {
  var db = this._data;
  if (!arguments.length) {
    var all = [], key;
    for (key in db) { all.push(db[key]); }
    return all;
  } else if (arguments.length === 1) {
    return db[name];
  } else {
    return (db[name] = new DataSource(this, name, facet).pipeline(pipeline));
  }
};

prototype.signal = function(name, init) {
  if (arguments.length === 1) {
    var m = this;
    return Array.isArray(name) ?
      name.map(function(n) { return m._signals[n]; }) :
      this._signals[name];
  } else {
    return (this._signals[name] = new Signal(this, name, init));
  }
};

prototype.signalRef = function(ref) {
  if (!Array.isArray(ref)) {
    ref = dl.field(ref);
  }

  var value = this.signal(ref[0]).value();
  if (ref.length > 1) {
    for (var i=1, n=ref.length; i<n; ++i) {
      value = value[ref[i]];
    }
  }
  return value;
};

prototype.requestIndex = function(data, field) {
  var ri  = this._requestedIndexes,
      reg = ri[data] || (ri[data] = {}); 
  return (reg[field] = true, this);
};

prototype.buildIndexes = function() {
  var ri = this._requestedIndexes,
      data = dl.keys(ri),
      i, len, j, jlen, d, src, fields, f;

  for (i=0, len=data.length; i<len; ++i) {
    src = this.data(d=data[i]);
    if (!src) throw Error('Data source '+dl.str(d)+' does not exist.');

    fields = dl.keys(ri[d]);
    for (j=0, jlen=fields.length; j<jlen; ++j) {
      if ((f=fields[j]) === null) continue;
      src.getIndex(f);
      ri[d][f] = null;
    }
  }

  return this;
};

// Stamp should be specified with caution. It is necessary for inline datasources,
// which need to be populated during the same cycle even though propagation has
// passed that part of the dataflow graph. 
// If skipSignals is true, Signal nodes do not get reevaluated but their listeners
// are queued for propagation. This is useful when setting signal values in batch
// (e.g., time travel to the initial state).
prototype.propagate = function(pulse, node, stamp, skipSignals) {
  var pulses = {},
      listeners, next, nplse, tpls, ntpls, i, len, isSg;

  // new PQ with each propagation cycle so that we can pulse branches
  // of the dataflow graph during a propagation (e.g., when creating
  // a new inline datasource).
  var pq = new Heap(function(a, b) {
    // Sort on qrank (queue-rank).
    // Rank can change during propagation due to rewiring.
    return a._qrank - b._qrank;
  });

  if (pulse.stamp) throw Error('Pulse already has a non-zero stamp.');

  pulse.stamp = stamp || ++this._stamp;
  pulses[node._id] = pulse;
  pq.push(node.qrank(true));

  while (pq.size() > 0) {
    node  = pq.peek();
    isSg  = node instanceof Signal;
    pulse = pulses[node._id];

    if (node.rank() !== node.qrank()) {
      // A node's rank might change during a propagation. Re-queue if so.
      pq.replace(node.qrank(true));
    } else {
      // Evaluate node and propagate pulse.
      pq.pop();
      pulses[node._id] = null;
      listeners = node._listeners;

      if (!isSg || (isSg && !skipSignals)) {
        pulse = this.evaluate(pulse, node);
      }

      // Propagate the pulse.
      if (pulse !== this.doNotPropagate) {
        // Ensure reflow pulses always send reflow pulses even if skipped.
        if (!pulse.reflow && node.reflows()) {
          pulse = ChangeSet.create(pulse, true);
        }

        for (i=0, len=listeners.length; i<len; ++i) {
          next = listeners[i];

          if ((nplse = pulses[next._id]) !== undefined) {
            if (nplse === null) throw Error('Already propagated to node.');
            if (nplse === pulse) continue;  // Re-queueing the same pulse.

            // We've already queued this node. Ensure there should be at most one
            // pulse with tuples (add/mod/rem), and the remainder will be reflows.
            tpls  = pulse.add.length || pulse.mod.length || pulse.rem.length;
            ntpls = nplse.add.length || nplse.mod.length || nplse.rem.length;

            if (tpls && ntpls) throw Error('Multiple changeset pulses to same node');

            // Combine reflow and tuples into a single pulse.
            pulses[next._id] = tpls ? pulse : nplse;
            pulses[next._id].reflow = pulse.reflow || nplse.reflow;
          } else {
            // First time we're seeing this node, queue it for propagation.
            pq.push(next.qrank(true));
            pulses[next._id] = pulse;
          }
        }
      }
    }
  }

  return this.done(pulse);
};

// Perform final bookkeeping on the graph, after propagation is complete.
//  - For all updated datasources, synchronize their previous values.
prototype.done = function(pulse) {
  log.debug(pulse, ['bookkeeping']);
  for (var d in pulse.data) { this.data(d).synchronize(); }
  return this;
};

// Process a new branch of the dataflow graph prior to connection:
// (1) Insert new Collector nodes as needed.
// (2) Track + return mutation/routing status of the branch.
prototype.preprocess = function(branch) {
  var graph = this,
      mutates = 0,
      node, router, collector, collects;

  for (var i=0; i<branch.length; ++i) {
    node = branch[i];

    // Batch nodes need access to a materialized dataset.
    if (node.batch() && !node._collector) {
      if (router || !collector) {
        node = new Collector(graph);
        branch.splice(i, 0, node);
        router = false;
      } else {
        node._collector = collector;
      }
    }

    if ((collects = node.collector())) collector = node;
    router  = router  || node.router() && !collects;
    mutates = mutates || node.mutates();

    // A collector needs to be inserted after tuple-producing
    // nodes for correct previous value tracking.
    if (node.produces()) {
      branch.splice(i+1, 0, new Collector(graph));
      router = false;
    }
  }

  return {router: router, collector: collector, mutates: mutates};
};

prototype.connect = function(branch) {
  var collector, node, data, signals, i, n, j, m, x, y;

  // connect the pipeline
  for (i=0, n=branch.length; i<n; ++i) {
    node = branch[i];
    if (node.collector()) collector = node;

    data = node.dependency(Deps.DATA);
    for (j=0, m=data.length; j<m; ++j) {
      if (!(x=this.data(y=data[j]))) {
        throw new Error('Unknown data source ' + dl.str(y));
      }

      x.addListener(collector);
    }

    signals = node.dependency(Deps.SIGNALS);
    for (j=0, m=signals.length; j<m; ++j) {
      if (!(x=this.signal(y=signals[j]))) {
        throw new Error('Unknown signal ' + dl.str(y));
      }

      x.addListener(collector);
    }

    if (i > 0) branch[i-1].addListener(node);
  }

  return branch;
};

prototype.disconnect = function(branch) {
  var collector, node, data, signals, i, n, j, m;

  for (i=0, n=branch.length; i<n; ++i) {
    node = branch[i];
    if (node.collector()) collector = node;

    data = node.dependency(Deps.DATA);
    for (j=0, m=data.length; j<m; ++j) {
      this.data(data[j]).removeListener(collector);
    }

    signals = node.dependency(Deps.SIGNALS);
    for (j=0, m=signals.length; j<m; ++j) {
      this.signal(signals[j]).removeListener(collector);
    }

    node.disconnect();
  }

  return branch;
};

prototype.synchronize = function(branch) {
  var ids = {},
      node, data, i, n, j, m, d, id;

  for (i=0, n=branch.length; i<n; ++i) {
    node = branch[i];
    if (!node.collector()) continue;

    for (j=0, data=node.data(), m=data.length; j<m; ++j) {
      id = (d = data[j])._id;
      if (ids[id]) continue;
      Tuple.prev_update(d);
      ids[id] = 1;
    }
  }

  return this;
};

prototype.reevaluate = function(pulse, node) {
  var reflowed = pulse.reflow && node.last() >= pulse.stamp,
      run = node.router() || pulse.add.length || pulse.rem.length;

  return run || !reflowed || node.reevaluate(pulse);
};

prototype.evaluate = function(pulse, node) {
  if (!this.reevaluate(pulse, node)) return pulse;
  pulse = node.evaluate(pulse);
  node.last(pulse.stamp);
  return pulse;
};

module.exports = Graph;


/***/ }),

/***/ "Aj/a":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

var defaultRatio = 0.5 * (1 + Math.sqrt(5));

function Treemap(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    // hierarchy parameters
    sort: {type: 'array<field>', default: ['-value']},
    children: {type: 'field', default: 'children'},
    parent: {type: 'field', default: 'parent'},
    field: {type: 'field', default: 'value'},
    // treemap parameters
    size: {type: 'array<value>', default: __webpack_require__("MRce").size},
    round: {type: 'value', default: true},
    sticky: {type: 'value', default: false},
    ratio: {type: 'value', default: defaultRatio},
    padding: {type: 'value', default: null},
    mode: {type: 'value', default: 'squarify'}
  });

  this._layout = d3.layout.treemap();

  this._output = {
    'x':      'layout_x',
    'y':      'layout_y',
    'width':  'layout_width',
    'height': 'layout_height',
    'depth':  'layout_depth',
  };
  return this.mutates(true);
}

var prototype = (Treemap.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Treemap;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['treemap']);

  // get variables
  var layout = this._layout,
      output = this._output,
      sticky = this.param('sticky'),
      parent = this.param('parent').accessor,
      root = data.filter(function(d) { return parent(d) === null; })[0];

  // layout.sticky resets state _regardless_ of input value
  // so, we perform out own check first
  if (layout.sticky() !== sticky) { layout.sticky(sticky); }

  // configure layout
  layout
    .sort(dl.comparator(this.param('sort').field))
    .children(this.param('children').accessor)
    .value(this.param('field').accessor)
    .size(this.param('size'))
    .round(this.param('round'))
    .ratio(this.param('ratio'))
    .padding(this.param('padding'))
    .mode(this.param('mode'))
    .nodes(root);

  // copy layout values to nodes
  data.forEach(function(n) {
    Tuple.set(n, output.x, n.x);
    Tuple.set(n, output.y, n.y);
    Tuple.set(n, output.width, n.dx);
    Tuple.set(n, output.height, n.dy);
    Tuple.set(n, output.depth, n.depth);
  });

  // return changeset
  input.fields[output.x] = 1;
  input.fields[output.y] = 1;
  input.fields[output.width] = 1;
  input.fields[output.height] = 1;
  input.fields[output.depth] = 1;
  return input;
};

module.exports = Treemap;

Treemap.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Treemap transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["treemap"]},
    "sort": {
      "description": "A list of fields to use as sort criteria for sibling nodes.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": ["-value"]
    },
    "children": {
      "description": "The data field for the children node array",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "children"
    },
    "parent": {
      "description": "The data field for the parent node",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "parent"
    },
    "field": {
      "description": "The values to use to determine the area of each leaf-level treemap cell.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "mode": {
      "description": "The treemap layout algorithm to use.",
      "oneOf": [
        {"enum": ["squarify", "slice", "dice", "slice-dice"]},
        {"$ref": "#/refs/signal"}
      ],
      "default": "squarify"
    },
    "size": {
      "description": "The dimensions of the treemap layout",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
          "minItems": 2,
          "maxItems": 2
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": [500, 500]
    },
    "round": {
      "description": "If true, treemap cell dimensions will be rounded to integer pixels.",
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "default": true
    },
    "sticky": {
      "description": "If true, repeated runs of the treemap will use cached partition boundaries.",
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "default": false
    },
    "ratio": {
      "description": "The target aspect ratio for the layout to optimize.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": defaultRatio
    },
    "padding": {
      "oneOf": [
        {"type": "number"},
        {
          "type": "array",
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
          "minItems": 4,
          "maxItems": 4
        },
        {"$ref": "#/refs/signal"}
      ],
      "description": "he padding (in pixels) to provide around internal nodes in the treemap."
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "x": {"type": "string", "default": "layout_x"},
        "y": {"type": "string", "default": "layout_y"},
        "width": {"type": "string", "default": "layout_width"},
        "height": {"type": "string", "default": "layout_height"},
        "depth": {"type": "string", "default": "layout_depth"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "B1p+":
/***/ (function(module, exports, __webpack_require__) {

var log = __webpack_require__("J731"),
    Tuple = __webpack_require__("gtuQ"),
    Base = __webpack_require__("3FFs").prototype,
    ChangeSet = __webpack_require__("ekYZ");

function Collector(graph) {
  Base.init.call(this, graph);
  this._data = [];
  this.router(true).collector(true);
}

var prototype = (Collector.prototype = Object.create(Base));
prototype.constructor = Collector;

prototype.data = function() {
  return this._data;
};

prototype.evaluate = function(input) {
  log.debug(input, ["collecting"]);

  // Create a new output changeset to prevent pollution when the Graph
  // merges reflow and regular changesets.
  var output = ChangeSet.create(input);

  if (input.rem.length) {
    this._data = Tuple.idFilter(this._data, input.rem);
    output.rem = input.rem.slice(0);
  }

  if (input.add.length) {
    this._data = this._data.concat(input.add);
    output.add = input.add.slice(0);
  }

  if (input.mod.length) {
    output.mod = input.mod.slice(0);
  }

  if (input.sort) {
    this._data.sort(input.sort);
  }

  if (input.reflow) {
    output.mod = output.mod.concat(
      Tuple.idFilter(this._data, output.add, output.mod, output.rem));
    output.reflow = false;
  }

  return output;
};

module.exports = Collector;

/***/ }),

/***/ "BB2X":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    Node  = df.Node, // jshint ignore:line
    Deps  = df.Dependencies,
    Tuple = df.Tuple,
    Collector = df.Collector,
    log = __webpack_require__("J731"),
    Builder = __webpack_require__("Vp7n"),
    Scale = __webpack_require__("NNYs"),
    parseAxes = __webpack_require__("W+IH"),
    parseLegends = __webpack_require__("v4pi");

function GroupBuilder() {
  this._children = {};
  this._scaler = null;
  this._recursor = null;

  this._scales = {};
  this.scale = scale.bind(this);
  return arguments.length ? this.init.apply(this, arguments) : this;
}

var Types = GroupBuilder.TYPES = {
  GROUP:  "group",
  MARK:   "mark",
  AXIS:   "axis",
  LEGEND: "legend"
};

var proto = (GroupBuilder.prototype = new Builder());

proto.init = function(graph, def) {
  var builder = this, name;

  this._scaler = new Node(graph);

  (def.scales||[]).forEach(function(s) {
    s = builder.scale((name=s.name), new Scale(graph, s, builder));
    builder.scale(name+":prev", s);
    builder._scaler.addListener(s);  // Scales should be computed after group is encoded
  });

  this._recursor = new Node(graph);
  this._recursor.evaluate = recurse.bind(this);

  var scales = (def.axes||[]).reduce(function(acc, x) {
    acc[x.scale] = 1;
    return acc;
  }, {});

  scales = (def.legends||[]).reduce(function(acc, x) {
    acc[x.size || x.shape || x.fill || x.stroke || x.opacity] = 1;
    return acc;
  }, scales);

  this._recursor.dependency(Deps.SCALES, dl.keys(scales));

  // We only need a collector for up-propagation of bounds calculation,
  // so only GroupBuilders, and not regular Builders, have collectors.
  this._collector = new Collector(graph);

  return Builder.prototype.init.apply(this, arguments);
};

proto.evaluate = function() {
  var output  = Builder.prototype.evaluate.apply(this, arguments),
      model   = this._graph,
      builder = this,
      scales = this._scales,
      items  = this._mark.items;

  // If scales need to be reevaluated, we need to send all group items forward.
  if (output.mod.length < items.length) {
    var fullUpdate = dl.keys(scales).some(function(s) {
      return scales[s].reevaluate(output);
    });

    if (!fullUpdate && this._def.axes) {
      fullUpdate = this._def.axes.reduce(function(acc, a) {
        return acc || output.scales[a.scale];
      }, false);
    }

    if (!fullUpdate && this._def.legends) {
      fullUpdate = this._def.legends.reduce(function(acc, l) {
        return acc || output.scales[l.size || l.shape || l.fill || l.stroke];
      }, false);
    }

    if (fullUpdate) {
      output.mod = output.mod.concat(Tuple.idFilter(items,
          output.mod, output.add, output.rem));
    }
  }

  output.add.forEach(function(group) { buildGroup.call(builder, output, group); });
  output.rem.forEach(function(group) { model.group(group._id, null); });
  return output;
};

proto.pipeline = function() {
  return [this, this._scaler, this._recursor, this._collector, this._bounder];
};

proto.disconnect = function() {
  var builder = this;
  dl.keys(builder._children).forEach(function(group_id) {
    builder._children[group_id].forEach(function(c) {
      builder._recursor.removeListener(c.builder);
      c.builder.disconnect();
    });
  });

  builder._children = {};
  return Builder.prototype.disconnect.call(this);
};

proto.child = function(name, group_id) {
  var children = this._children[group_id],
      i = 0, len = children.length,
      child;

  for (; i<len; ++i) {
    child = children[i];
    if (child.type == Types.MARK && child.builder._def.name == name) break;
  }

  return child.builder;
};

function recurse(input) {
  var builder = this,
      hasMarks = dl.array(this._def.marks).length > 0,
      hasAxes = dl.array(this._def.axes).length > 0,
      hasLegends = dl.array(this._def.legends).length > 0,
      i, j, c, len, group, pipeline, def, inline = false;

  for (i=0, len=input.add.length; i<len; ++i) {
    group = input.add[i];
    if (hasMarks) buildMarks.call(this, input, group);
    if (hasAxes)  buildAxes.call(this, input, group);
    if (hasLegends) buildLegends.call(this, input, group);
  }

  // Wire up new children builders in reverse to minimize graph rewrites.
  for (i=input.add.length-1; i>=0; --i) {
    group = input.add[i];
    for (j=this._children[group._id].length-1; j>=0; --j) {
      c = this._children[group._id][j];
      c.builder.connect();
      pipeline = c.builder.pipeline();
      def = c.builder._def;

      // This new child needs to be built during this propagation cycle.
      // We could add its builder as a listener off the _recursor node,
      // but try to inline it if we can to minimize graph dispatches.
      inline = (def.type !== Types.GROUP);
      inline = inline && (this._graph.data(c.from) !== undefined);
      inline = inline && (pipeline[pipeline.length-1].listeners().length === 1); // Reactive geom source
      inline = inline && (def.from && !def.from.mark); // Reactive geom target
      c.inline = inline;

      if (inline) this._graph.evaluate(input, c.builder);
      else this._recursor.addListener(c.builder);
    }
  }

  function removeTemp(c) {
    if (c.type == Types.MARK && !c.inline &&
        builder._graph.data(c.from) !== undefined) {
      builder._recursor.removeListener(c.builder);
    }
  }

  function updateAxis(a) {
    var scale = a.scale();
    if (!input.scales[scale.scaleName]) return;
    a.reset().def();
  }

  function updateLegend(l) {
    var scale = l.size() || l.shape() || l.fill() || l.stroke() || l.opacity();
    if (!input.scales[scale.scaleName]) return;
    l.reset().def();
  }

  for (i=0, len=input.mod.length; i<len; ++i) {
    group = input.mod[i];

    // Remove temporary connection for marks that draw from a source
    if (hasMarks) builder._children[group._id].forEach(removeTemp);

    // Update axis data defs
    if (hasAxes) group.axes.forEach(updateAxis);

    // Update legend data defs
    if (hasLegends) group.legends.forEach(updateLegend);
  }

  function disconnectChildren(c) {
    builder._recursor.removeListener(c.builder);
    c.builder.disconnect();
  }

  for (i=0, len=input.rem.length; i<len; ++i) {
    group = input.rem[i];
    // For deleted groups, disconnect their children
    builder._children[group._id].forEach(disconnectChildren);
    delete builder._children[group._id];
  }

  return input;
}

function scale(name, x) {
  var group = this, s = null;
  if (arguments.length === 2) return (group._scales[name] = x, x);
  while (s == null) {
    s = group._scales[name];
    group = group.mark ? group.mark.group : group._parent;
    if (!group) break;
  }
  return s;
}

function buildGroup(input, group) {
  log.debug(input, ["building group", group._id]);

  group._scales = group._scales || {};
  group.scale = scale.bind(group);

  group.items = group.items || [];
  this._children[group._id] = this._children[group._id] || [];

  group.axes = group.axes || [];
  group.axisItems = group.axisItems || [];

  group.legends = group.legends || [];
  group.legendItems = group.legendItems || [];

  // Index group by ID to enable safe scoped scale lookups.
  this._graph.group(group._id, group);
}

function buildMarks(input, group) {
  log.debug(input, ["building children marks #"+group._id]);
  var marks = this._def.marks,
      mark, from, inherit, i, len, b;

  for (i=0, len=marks.length; i<len; ++i) {
    mark = marks[i];
    from = mark.from || {};
    inherit = group.datum._facetID;
    group.items[i] = {group: group, _scaleRefs: {}};
    b = (mark.type === Types.GROUP) ? new GroupBuilder() : new Builder();
    b.init(this._graph, mark, group.items[i], this, group._id, inherit);
    this._children[group._id].push({
      builder: b,
      from: from.data || (from.mark ? ("vg_" + group._id + "_" + from.mark) : inherit),
      type: Types.MARK
    });
  }
}

function buildAxes(input, group) {
  var axes = group.axes,
      axisItems = group.axisItems,
      builder = this;

  parseAxes(this._graph, this._def.axes, axes, group);
  axes.forEach(function(a, i) {
    var scale = builder._def.axes[i].scale,
        def = a.def(),
        b = null;

    axisItems[i] = {group: group, axis: a, layer: def.layer};
    b = (def.type === Types.GROUP) ? new GroupBuilder() : new Builder();
    b.init(builder._graph, def, axisItems[i], builder)
      .dependency(Deps.SCALES, scale);
    builder._children[group._id].push({ builder: b, type: Types.AXIS, scale: scale });
  });
}

function buildLegends(input, group) {
  var legends = group.legends,
      legendItems = group.legendItems,
      builder = this;

  parseLegends(this._graph, this._def.legends, legends, group);
  legends.forEach(function(l, i) {
    var scale = l.size() || l.shape() || l.fill() || l.stroke() || l.opacity(),
        def = l.def(),
        b = null;

    legendItems[i] = {group: group, legend: l};
    b = (def.type === Types.GROUP) ? new GroupBuilder() : new Builder();
    b.init(builder._graph, def, legendItems[i], builder)
      .dependency(Deps.SCALES, scale);
    builder._children[group._id].push({ builder: b, type: Types.LEGEND, scale: scale });
  });
}

module.exports = GroupBuilder;

/***/ }),

/***/ "BO8z":
/***/ (function(module, exports, __webpack_require__) {

var df = __webpack_require__("Hqva"),
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Filter(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {test: {type: 'expr'}});

  this._skip = {};
  return this.router(true);
}

var prototype = (Filter.prototype = Object.create(Transform.prototype));
prototype.constructor = Filter;

prototype.transform = function(input) {
  log.debug(input, ['filtering']);

  var output = df.ChangeSet.create(input),
      skip = this._skip,
      test = this.param('test');

  input.rem.forEach(function(x) {
    if (skip[x._id] !== 1) output.rem.push(x);
    else skip[x._id] = 0;
  });

  input.add.forEach(function(x) {
    if (test(x)) output.add.push(x);
    else skip[x._id] = 1;
  });

  input.mod.forEach(function(x) {
    var b = test(x),
        s = (skip[x._id] === 1);
    if (b && s) {
      skip[x._id] = 0;
      output.add.push(x);
    } else if (b && !s) {
      output.mod.push(x);
    } else if (!b && s) {
      // do nothing, keep skip true
    } else { // !b && !s
      output.rem.push(x);
      skip[x._id] = 1;
    }
  });

  return output;
};

module.exports = Filter;

Filter.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Filter transform",
  "description": "Filters elements from a data set to remove unwanted items.",
  "type": "object",
  "properties": {
    "type": {"enum": ["filter"]},
    "test": {
      "type": "string",
      "description": "A string containing an expression (in JavaScript syntax) for the filter predicate."
    }
  },
  "additionalProperties": false,
  "required": ["type", "test"]
};


/***/ }),

/***/ "BONk":
/***/ (function(module, exports, __webpack_require__) {

var BoundsContext = __webpack_require__("81R7"),
    Bounds = __webpack_require__("lnKO"),
    canvas = __webpack_require__("WFOa"),
    svg = __webpack_require__("zhsD"),
    text = __webpack_require__("3Scv"),
    paths = __webpack_require__("pfe9"),
    parse = paths.parse,
    drawPath = paths.render,
    areaPath = svg.path.area,
    linePath = svg.path.line,
    halfpi = Math.PI / 2,
    sqrt3 = Math.sqrt(3),
    tan30 = Math.tan(30 * Math.PI / 180),
    g2D = null,
    bc = BoundsContext();

function context() {
  return g2D || (g2D = canvas.instance(1,1).getContext('2d'));
}

function strokeBounds(o, bounds) {
  if (o.stroke && o.opacity !== 0 && o.stokeOpacity !== 0) {
    bounds.expand(o.strokeWidth != null ? o.strokeWidth : 1);
  }
  return bounds;
}

function pathBounds(o, path, bounds, x, y) {
  if (path == null) {
    bounds.set(0, 0, 0, 0);
  } else {
    drawPath(bc.bounds(bounds), path, x, y);
    strokeBounds(o, bounds);
  }
  return bounds;
}

function path(o, bounds) {
  var p = o.path ? o.pathCache || (o.pathCache = parse(o.path)) : null;
  return pathBounds(o, p, bounds, o.x, o.y);
}

function area(mark, bounds) {
  if (mark.items.length === 0) return bounds;
  var items = mark.items,
      item = items[0],
      p = item.pathCache || (item.pathCache = parse(areaPath(items)));
  return pathBounds(item, p, bounds);
}

function line(mark, bounds) {
  if (mark.items.length === 0) return bounds;
  var items = mark.items,
      item = items[0],
      p = item.pathCache || (item.pathCache = parse(linePath(items)));
  return pathBounds(item, p, bounds);
}

function rect(o, bounds) {
  var x, y;
  return strokeBounds(o, bounds.set(
    x = o.x || 0,
    y = o.y || 0,
    (x + o.width) || 0,
    (y + o.height) || 0
  ));
}

function image(o, bounds) {
  var x = o.x || 0,
      y = o.y || 0,
      w = o.width || 0,
      h = o.height || 0;
  x = x - (o.align === 'center' ? w/2 : (o.align === 'right' ? w : 0));
  y = y - (o.baseline === 'middle' ? h/2 : (o.baseline === 'bottom' ? h : 0));
  return bounds.set(x, y, x+w, y+h);
}

function rule(o, bounds) {
  var x1, y1;
  return strokeBounds(o, bounds.set(
    x1 = o.x || 0,
    y1 = o.y || 0,
    o.x2 != null ? o.x2 : x1,
    o.y2 != null ? o.y2 : y1
  ));
}

function arc(o, bounds) {
  var cx = o.x || 0,
      cy = o.y || 0,
      ir = o.innerRadius || 0,
      or = o.outerRadius || 0,
      sa = (o.startAngle || 0) - halfpi,
      ea = (o.endAngle || 0) - halfpi,
      xmin = Infinity, xmax = -Infinity,
      ymin = Infinity, ymax = -Infinity,
      a, i, n, x, y, ix, iy, ox, oy;

  var angles = [sa, ea],
      s = sa - (sa % halfpi);
  for (i=0; i<4 && s<ea; ++i, s+=halfpi) {
    angles.push(s);
  }

  for (i=0, n=angles.length; i<n; ++i) {
    a = angles[i];
    x = Math.cos(a); ix = ir*x; ox = or*x;
    y = Math.sin(a); iy = ir*y; oy = or*y;
    xmin = Math.min(xmin, ix, ox);
    xmax = Math.max(xmax, ix, ox);
    ymin = Math.min(ymin, iy, oy);
    ymax = Math.max(ymax, iy, oy);
  }

  return strokeBounds(o, bounds.set(
    cx + xmin,
    cy + ymin,
    cx + xmax,
    cy + ymax
  ));
}

function symbol(o, bounds) {
  var size = o.size != null ? o.size : 100,
      x = o.x || 0,
      y = o.y || 0,
      r, t, rx, ry;

  switch (o.shape) {
    case 'cross':
      t = 3 * Math.sqrt(size / 5) / 2;
      bounds.set(x-t, y-t, x+t, y+t);
      break;

    case 'diamond':
      ry = Math.sqrt(size / (2 * tan30));
      rx = ry * tan30;
      bounds.set(x-rx, y-ry, x+rx, y+ry);
      break;

    case 'square':
      t = Math.sqrt(size);
      r = t / 2;
      bounds.set(x-r, y-r, x+r, y+r);
      break;

    case 'triangle-down':
      rx = Math.sqrt(size / sqrt3);
      ry = rx * sqrt3 / 2;
      bounds.set(x-rx, y-ry, x+rx, y+ry);
      break;

    case 'triangle-up':
      rx = Math.sqrt(size / sqrt3);
      ry = rx * sqrt3 / 2;
      bounds.set(x-rx, y-ry, x+rx, y+ry);
      break;

    default:
      r = Math.sqrt(size/Math.PI);
      bounds.set(x-r, y-r, x+r, y+r);
  }

  return strokeBounds(o, bounds);
}

function textMark(o, bounds, noRotate) {
  var g = context(),
      h = text.size(o),
      a = o.align,
      r = o.radius || 0,
      x = (o.x || 0),
      y = (o.y || 0),
      dx = (o.dx || 0),
      dy = (o.dy || 0) + text.offset(o) - Math.round(0.8*h), // use 4/5 offset
      w, t;

  if (r) {
    t = (o.theta || 0) - Math.PI/2;
    x += r * Math.cos(t);
    y += r * Math.sin(t);
  }

  // horizontal alignment
  g.font = text.font(o);
  w = g.measureText(text.value(o.text)).width;
  if (a === 'center') {
    dx -= (w / 2);
  } else if (a === 'right') {
    dx -= w;
  } else {
    // left by default, do nothing
  }

  bounds.set(dx+=x, dy+=y, dx+w, dy+h);
  if (o.angle && !noRotate) {
    bounds.rotate(o.angle*Math.PI/180, x, y);
  }
  return bounds.expand(noRotate ? 0 : 1);
}

function group(g, bounds, includeLegends) {
  var axes = g.axisItems || [],
      items = g.items || [],
      legends = g.legendItems || [],
      j, m;

  if (!g.clip) {
    for (j=0, m=axes.length; j<m; ++j) {
      bounds.union(axes[j].bounds);
    }
    for (j=0, m=items.length; j<m; ++j) {
      if (items[j].bounds) bounds.union(items[j].bounds);
    }
    if (includeLegends) {
      for (j=0, m=legends.length; j<m; ++j) {
        bounds.union(legends[j].bounds);
      }
    }
  }
  if (g.clip || g.width || g.height) {
    strokeBounds(g, bounds
      .add(0, 0)
      .add(g.width || 0, g.height || 0));
  }
  return bounds.translate(g.x || 0, g.y || 0);
}

var methods = {
  group:  group,
  symbol: symbol,
  image:  image,
  rect:   rect,
  rule:   rule,
  arc:    arc,
  text:   textMark,
  path:   path,
  area:   area,
  line:   line
};
methods.area.nest = true;
methods.line.nest = true;

function itemBounds(item, func, opt) {
  var type = item.mark.marktype;
  func = func || methods[type];
  if (func.nest) item = item.mark;

  var curr = item.bounds,
      prev = item['bounds:prev'] || (item['bounds:prev'] = new Bounds());

  if (curr) {
    prev.clear().union(curr);
    curr.clear();
  } else {
    item.bounds = new Bounds();
  }
  func(item, item.bounds, opt);
  if (!curr) prev.clear().union(item.bounds);
  return item.bounds;
}

var DUMMY_ITEM = {mark: null};

function markBounds(mark, bounds, opt) {
  var type  = mark.marktype,
      func  = methods[type],
      items = mark.items,
      hasi  = items && items.length,
      i, n, o, b;

  if (func.nest) {
    o = hasi ? items[0]
      : (DUMMY_ITEM.mark = mark, DUMMY_ITEM); // no items, so fake it
    b = itemBounds(o, func, opt);
    bounds = bounds && bounds.union(b) || b;
    return bounds;
  }

  bounds = bounds || mark.bounds && mark.bounds.clear() || new Bounds();
  if (hasi) {  
    for (i=0, n=items.length; i<n; ++i) {
      bounds.union(itemBounds(items[i], func, opt));
    }
  }
  return (mark.bounds = bounds);
}

module.exports = {
  mark:  markBounds,
  item:  itemBounds,
  text:  textMark,
  group: group
};


/***/ }),

/***/ "C8zq":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  aggregate:    __webpack_require__("3Y21"),
  bin:          __webpack_require__("RdYp"),
  cross:        __webpack_require__("juLC"),
  countpattern: __webpack_require__("6+LD"),
  linkpath:     __webpack_require__("rCVn"),
  facet:        __webpack_require__("Uikm"),
  filter:       __webpack_require__("BO8z"),
  fold:         __webpack_require__("MZ+b"),
  force:        __webpack_require__("pKLr"),
  formula:      __webpack_require__("TXaq"),
  geo:          __webpack_require__("ct8e"),
  geopath:      __webpack_require__("snBf"),
  hierarchy:    __webpack_require__("Sgrz"),
  impute:       __webpack_require__("P7vC"),
  lookup:       __webpack_require__("ec8D"),
  pie:          __webpack_require__("58eP"),
  rank:         __webpack_require__("yLCL"),
  sort:         __webpack_require__("/lc5"),
  stack:        __webpack_require__("wLy+"),
  treeify:      __webpack_require__("ei6W"),
  treemap:      __webpack_require__("Aj/a"),
  voronoi:      __webpack_require__("3C/O"),
  wordcloud:    __webpack_require__("GXXi")
};

/***/ }),

/***/ "CXWl":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    Gradient = __webpack_require__("LHV8").Gradient,
    parseProperties = __webpack_require__("h36N"),
    parseMark = __webpack_require__("SbOu"),
    util = __webpack_require__("v0Fq");

function lgnd(model) {
  var size  = null,
      shape = null,
      fill  = null,
      stroke  = null,
      opacity = null,
      spacing = null,
      values  = null,
      formatString = null,
      formatType   = null,
      title  = null,
      config = model.config().legend,
      orient = config.orient,
      offset = config.offset,
      padding = config.padding,
      tickArguments = [5],
      legendStyle = {},
      symbolStyle = {},
      gradientStyle = {},
      titleStyle = {},
      labelStyle = {},
      m = { // Legend marks as references for updates
        titles:  {},
        symbols: {},
        labels:  {},
        gradient: {}
      };

  var legend = {},
      legendDef = {};

  function reset() { legendDef.type = null; }
  function ingest(d, i) { return {data: d, index: i}; }

  legend.def = function() {
    var scale = size || shape || fill || stroke || opacity;

    if (!legendDef.type) {
      legendDef = (scale===fill || scale===stroke) && !discrete(scale.type) ?
        quantDef(scale) : ordinalDef(scale);
    }
    legendDef.orient = orient;
    legendDef.offset = offset;
    legendDef.padding = padding;
    legendDef.margin = config.margin;
    return legendDef;
  };

  function discrete(type) {
    return type==='ordinal' || type==='quantize' ||
           type==='quantile' || type==='threshold';
  }

  function ordinalDef(scale) {
    var def = o_legend_def(size, shape, fill, stroke, opacity);

    // generate data
    var data = (values == null ?
      (scale.ticks ? scale.ticks.apply(scale, tickArguments) : scale.domain()) :
      values).map(ingest);

    var fmt = util.getTickFormat(scale, data.length, formatType, formatString);

    // determine spacing between legend entries
    var fs, range, offset, pad=5, domain = d3.range(data.length);
    if (size) {
      range = data.map(function(x) { return Math.sqrt(size(x.data)); });
      offset = d3.max(range);
      range = range.reduce(function(a,b,i,z) {
          if (i > 0) a[i] = a[i-1] + z[i-1]/2 + pad;
          return (a[i] += b/2, a); }, [0]).map(Math.round);
    } else {
      offset = Math.round(Math.sqrt(config.symbolSize));
      range = spacing ||
        (fs = labelStyle.fontSize) && (fs.value + pad) ||
        (config.labelFontSize + pad);
      range = domain.map(function(d,i) {
        return Math.round(offset/2 + i*range);
      });
    }

    // account for padding and title size
    var sz = padding, ts;
    if (title) {
      ts = titleStyle.fontSize;
      sz += 5 + ((ts && ts.value) || config.titleFontSize);
    }
    for (var i=0, n=range.length; i<n; ++i) range[i] += sz;

    // build scale for label layout
    def.scales = def.scales || [{}];
    dl.extend(def.scales[0], {
      name: 'legend',
      type: 'ordinal',
      points: true,
      domain: domain,
      range: range
    });

    // update legend def
    var tdata = (title ? [title] : []).map(ingest);
    data.forEach(function(d) {
      d.label = fmt(d.data);
      d.offset = offset;
    });
    def.marks[0].from = function() { return tdata; };
    def.marks[1].from = function() { return data; };
    def.marks[2].from = def.marks[1].from;

    return def;
  }

  function o_legend_def(size, shape, fill, stroke, opacity) {
    // setup legend marks
    var titles  = dl.extend(m.titles, legendTitle(config)),
        symbols = dl.extend(m.symbols, legendSymbols(config)),
        labels  = dl.extend(m.labels, vLegendLabels(config));

    // extend legend marks
    legendSymbolExtend(symbols, size, shape, fill, stroke, opacity);

    // add / override custom style properties
    dl.extend(titles.properties.update,  titleStyle);
    dl.extend(symbols.properties.update, symbolStyle);
    dl.extend(labels.properties.update,  labelStyle);

    // padding from legend border
    titles.properties.enter.x.value += padding;
    titles.properties.enter.y.value += padding;
    labels.properties.enter.x.offset += padding + 1;
    symbols.properties.enter.x.offset = padding + 1;
    labels.properties.update.x.offset += padding + 1;
    symbols.properties.update.x.offset = padding + 1;

    dl.extend(legendDef, {
      type: 'group',
      interactive: false,
      properties: {
        enter: parseProperties(model, 'group', legendStyle),
        legendPosition: {
          encode: legendPosition.bind(null, config),
          signals: [], scales:[], data: [], fields: []
        }
      }
    });

    legendDef.marks = [titles, symbols, labels].map(function(m) { return parseMark(model, m); });
    return legendDef;
  }

  function quantDef(scale) {
    var def = q_legend_def(scale),
        dom = scale.domain(),
        data  = (values == null ? dom : values).map(ingest),
        width = (gradientStyle.width && gradientStyle.width.value) || config.gradientWidth,
        fmt = util.getTickFormat(scale, data.length, formatType, formatString);

    // build scale for label layout
    def.scales = def.scales || [{}];
    var layoutSpec = dl.extend(def.scales[0], {
      name: 'legend',
      type: scale.type,
      round: true,
      zero: false,
      domain: [dom[0], dom[dom.length-1]],
      range: [padding, width+padding]
    });
    if (scale.type==='pow') layoutSpec.exponent = scale.exponent();

    // update legend def
    var tdata = (title ? [title] : []).map(ingest);
    data.forEach(function(d,i) {
      d.label = fmt(d.data);
      d.align = i==(data.length-1) ? 'right' : i===0 ? 'left' : 'center';
    });

    def.marks[0].from = function() { return tdata; };
    def.marks[1].from = function() { return [1]; };
    def.marks[2].from = function() { return data; };
    return def;
  }

  function q_legend_def(scale) {
    // setup legend marks
    var titles = dl.extend(m.titles, legendTitle(config)),
        gradient = dl.extend(m.gradient, legendGradient(config)),
        labels = dl.extend(m.labels, hLegendLabels(config)),
        grad = new Gradient();

    // setup color gradient
    var dom = scale.domain(),
        min = dom[0],
        max = dom[dom.length-1],
        f = scale.copy().domain([min, max]).range([0,1]);

    var stops = (scale.type !== 'linear' && scale.ticks) ?
      scale.ticks.call(scale, 15) : dom;
    if (min !== stops[0]) stops.unshift(min);
    if (max !== stops[stops.length-1]) stops.push(max);

    for (var i=0, n=stops.length; i<n; ++i) {
      grad.stop(f(stops[i]), scale(stops[i]));
    }
    gradient.properties.enter.fill = {value: grad};

    // add / override custom style properties
    dl.extend(titles.properties.update, titleStyle);
    dl.extend(gradient.properties.update, gradientStyle);
    dl.extend(labels.properties.update, labelStyle);

    // account for gradient size
    var gp = gradient.properties, gh = gradientStyle.height,
        hh = (gh && gh.value) || gp.enter.height.value;
    labels.properties.enter.y.value = hh;
    labels.properties.update.y.value = hh;

    // account for title size as needed
    if (title) {
      var tp = titles.properties, fs = titleStyle.fontSize,
          sz = 4 + ((fs && fs.value) || tp.enter.fontSize.value);
      gradient.properties.enter.y.value += sz;
      labels.properties.enter.y.value += sz;
      gradient.properties.update.y.value += sz;
      labels.properties.update.y.value += sz;
    }

    // padding from legend border
    titles.properties.enter.x.value += padding;
    titles.properties.enter.y.value += padding;
    gradient.properties.enter.x.value += padding;
    gradient.properties.enter.y.value += padding;
    labels.properties.enter.y.value += padding;
    gradient.properties.update.x.value += padding;
    gradient.properties.update.y.value += padding;
    labels.properties.update.y.value += padding;

    dl.extend(legendDef, {
      type: 'group',
      interactive: false,
      properties: {
        enter: parseProperties(model, 'group', legendStyle),
        legendPosition: {
          encode: legendPosition.bind(null, config),
          signals: [], scales: [], data: [], fields: []
        }
      }
    });

    legendDef.marks = [titles, gradient, labels].map(function(m) { return parseMark(model, m); });
    return legendDef;
  }

  legend.size = function(x) {
    if (!arguments.length) return size;
    if (size !== x) { size = x; reset(); }
    return legend;
  };

  legend.shape = function(x) {
    if (!arguments.length) return shape;
    if (shape !== x) { shape = x; reset(); }
    return legend;
  };

  legend.fill = function(x) {
    if (!arguments.length) return fill;
    if (fill !== x) { fill = x; reset(); }
    return legend;
  };

  legend.stroke = function(x) {
    if (!arguments.length) return stroke;
    if (stroke !== x) { stroke = x; reset(); }
    return legend;
  };

  legend.opacity = function(x) {
    if (!arguments.length) return opacity;
    if (opacity !== x) { opacity = x; reset(); }
    return legend;
  };

  legend.title = function(x) {
    if (!arguments.length) return title;
    if (title !== x) { title = x; reset(); }
    return legend;
  };

  legend.format = function(x) {
    if (!arguments.length) return formatString;
    if (formatString !== x) {
      formatString = x;
      reset();
    }
    return legend;
  };

  legend.formatType = function(x) {
    if (!arguments.length) return formatType;
    if (formatType !== x) {
      formatType = x;
      reset();
    }
    return legend;
  };

  legend.spacing = function(x) {
    if (!arguments.length) return spacing;
    if (spacing !== +x) { spacing = +x; reset(); }
    return legend;
  };

  legend.orient = function(x) {
    if (!arguments.length) return orient;
    orient = x in LEGEND_ORIENT ? x + '' : config.orient;
    return legend;
  };

  legend.offset = function(x) {
    if (!arguments.length) return offset;
    offset = +x;
    return legend;
  };

  legend.values = function(x) {
    if (!arguments.length) return values;
    values = x;
    return legend;
  };

  legend.legendProperties = function(x) {
    if (!arguments.length) return legendStyle;
    legendStyle = x;
    return legend;
  };

  legend.symbolProperties = function(x) {
    if (!arguments.length) return symbolStyle;
    symbolStyle = x;
    return legend;
  };

  legend.gradientProperties = function(x) {
    if (!arguments.length) return gradientStyle;
    gradientStyle = x;
    return legend;
  };

  legend.labelProperties = function(x) {
    if (!arguments.length) return labelStyle;
    labelStyle = x;
    return legend;
  };

  legend.titleProperties = function(x) {
    if (!arguments.length) return titleStyle;
    titleStyle = x;
    return legend;
  };

  legend.reset = function() {
    reset();
    return legend;
  };

  return legend;
}

var LEGEND_ORIENT = {
  'left': 'x1',
  'right': 'x2',
  'top-left': 'x1',
  'top-right': 'x2',
  'bottom-left': 'x1',
  'bottom-right': 'x2'
};

function legendPosition(config, item, group, trans, db, signals, predicates) {
  var o = trans ? {} : item, i,
      def = item.mark.def,
      offset = def.offset,
      orient = def.orient,
      pad = def.padding * 2,
      ao  = orient === 'left' ? 0 : group.width,
      lw  = ~~item.bounds.width() + (item.width ? 0 : pad),
      lh  = ~~item.bounds.height() + (item.height ? 0 : pad),
      pos = group._legendPositions ||
        (group._legendPositions = {right: 0.5, left: 0.5});

  o.x = 0.5;
  o.y = 0.5;
  o.width = lw;
  o.height = lh;

  if (orient === 'left' || orient === 'right') {
    o.y = pos[orient];
    pos[orient] += lh + def.margin;

    // Calculate axis offset.
    var axes  = group.axes,
        items = group.axisItems,
        bound = LEGEND_ORIENT[orient];
    for (i=0; i<axes.length; ++i) {
      if (axes[i].orient() === orient) {
        ao = Math.max(ao, Math.abs(items[i].bounds[bound]));
      }
    }
  }

  switch (orient) {
    case 'left':
      o.x -= ao + offset + lw;
      break;
    case 'right':
      o.x += ao + offset;
      break;
    case 'top-left':
      o.x += offset;
      o.y += offset;
      break;
    case 'top-right':
      o.x += group.width - lw - offset;
      o.y += offset;
      break;
    case 'bottom-left':
      o.x += offset;
      o.y += group.height - lh - offset;
      break;
    case 'bottom-right':
      o.x += group.width - lw - offset;
      o.y += group.height - lh - offset;
      break;
  }

  var baseline = config.baseline,
      totalHeight = 0;
  for (i=0; i<group.legendItems.length; i++) {
    var currItem = group.legendItems[i];
    totalHeight += currItem.bounds.height() + (item.height ? 0 : pad);
  }

  if (baseline === 'middle') {
    o.y += offset + (group.height / 2) - (totalHeight / 2);
  } else if (baseline === 'bottom') {
    o.y += offset + group.height - totalHeight;
  }

  if (trans) trans.interpolate(item, o);
  var enc = item.mark.def.properties.enter.encode;
  enc.call(enc, item, group, trans, db, signals, predicates);
  return true;
}

function legendSymbolExtend(mark, size, shape, fill, stroke, opacity) {
  var e = mark.properties.enter,
      u = mark.properties.update;
  if (size)    e.size    = u.size    = {scale: size.scaleName,   field: 'data'};
  if (shape)   e.shape   = u.shape   = {scale: shape.scaleName,  field: 'data'};
  if (fill)    e.fill    = u.fill    = {scale: fill.scaleName,   field: 'data'};
  if (stroke)  e.stroke  = u.stroke  = {scale: stroke.scaleName, field: 'data'};
  if (opacity) u.opacity = {scale: opacity.scaleName, field: 'data'};
}

function legendTitle(config) {
  return {
    type: 'text',
    interactive: false,
    key: 'data',
    properties: {
      enter: {
        x: {value: 0},
        y: {value: 0},
        fill: {value: config.titleColor},
        font: {value: config.titleFont},
        fontSize: {value: config.titleFontSize},
        fontWeight: {value: config.titleFontWeight},
        baseline: {value: 'top'},
        text: {field: 'data'},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: { opacity: {value: 1} }
    }
  };
}

function legendSymbols(config) {
  return {
    type: 'symbol',
    interactive: false,
    key: 'data',
    properties: {
      enter: {
        x: {field: 'offset', mult: 0.5},
        y: {scale: 'legend', field: 'index'},
        shape: {value: config.symbolShape},
        size: {value: config.symbolSize},
        stroke: {value: config.symbolColor},
        strokeWidth: {value: config.symbolStrokeWidth},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: {
        x: {field: 'offset', mult: 0.5},
        y: {scale: 'legend', field: 'index'},
        opacity: {value: 1}
      }
    }
  };
}

function vLegendLabels(config) {
  return {
    type: 'text',
    interactive: false,
    key: 'data',
    properties: {
      enter: {
        x: {field: 'offset', offset: 5},
        y: {scale: 'legend', field: 'index'},
        fill: {value: config.labelColor},
        font: {value: config.labelFont},
        fontSize: {value: config.labelFontSize},
        align: {value: config.labelAlign},
        baseline: {value: config.labelBaseline},
        text: {field: 'label'},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: {
        opacity: {value: 1},
        x: {field: 'offset', offset: 5},
        y: {scale: 'legend', field: 'index'},
      }
    }
  };
}

function legendGradient(config) {
  return {
    type: 'rect',
    interactive: false,
    properties: {
      enter: {
        x: {value: 0},
        y: {value: 0},
        width: {value: config.gradientWidth},
        height: {value: config.gradientHeight},
        stroke: {value: config.gradientStrokeColor},
        strokeWidth: {value: config.gradientStrokeWidth},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: {
        x: {value: 0},
        y: {value: 0},
        opacity: {value: 1}
      }
    }
  };
}

function hLegendLabels(config) {
  return {
    type: 'text',
    interactive: false,
    key: 'data',
    properties: {
      enter: {
        x: {scale: 'legend', field: 'data'},
        y: {value: 20},
        dy: {value: 2},
        fill: {value: config.labelColor},
        font: {value: config.labelFont},
        fontSize: {value: config.labelFontSize},
        align: {field: 'align'},
        baseline: {value: 'top'},
        text: {field: 'label'},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: {
        x: {scale: 'legend', field: 'data'},
        y: {value: 20},
        opacity: {value: 1}
      }
    }
  };
}

module.exports = lgnd;


/***/ }),

/***/ "CiyH":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    parse = __webpack_require__("UaGl"),
    Scale = __webpack_require__("NNYs"),
    config = __webpack_require__("8NMF");

function compile(module, opt, schema) {
  var s = module.schema;
  if (!s) return;
  if (s.refs) dl.extend(schema.refs, s.refs);
  if (s.defs) dl.extend(schema.defs, s.defs);
}

module.exports = function(opt) {
  var schema = null;
  opt = opt || {};

  // Compile if we're not loading the schema from a URL.
  // Load from a URL to extend the existing base schema.
  if (opt.url) {
    schema = dl.json(dl.extend({url: opt.url}, config.load));
  } else {
    schema = {
      "$schema": "http://json-schema.org/draft-04/schema#",
      "title": "Vega Visualization Specification Language",
      "defs": {},
      "refs": {},
      "$ref": "#/defs/spec"
    };

    dl.keys(parse).forEach(function(k) { compile(parse[k], opt, schema); });

    // Scales aren't in the parser, add schema manually
    compile(Scale, opt, schema);
  }

  // Extend schema to support custom mark properties or property sets.
  if (opt.properties) dl.keys(opt.properties).forEach(function(k) {
    schema.defs.propset.properties[k] = {"$ref": "#/refs/"+opt.properties[k]+"Value"};
  });

  if (opt.propertySets) dl.keys(opt.propertySets).forEach(function(k) {
    schema.defs.mark.properties.properties.properties[k] = {"$ref": "#/defs/propset"};
  });

  return schema;
};


/***/ }),

/***/ "D3vM":
/***/ (function(module, exports) {

var deps = module.exports = {
  ALL: ['data', 'fields', 'scales', 'signals']
};
deps.ALL.forEach(function(k) { deps[k.toUpperCase()] = k; });


/***/ }),

/***/ "DUWk":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    transforms = __webpack_require__("C8zq");

function parseTransforms(model, def) {
  var transform = transforms[def.type],
      tx;

  if (!transform) throw new Error('"' + def.type + '" is not a valid transformation');

  tx = new transform(model);
  // We want to rename output fields before setting any other properties,
  // as subsequent properties may require output to be set (e.g. group by).
  if(def.output) tx.output(def.output);

  dl.keys(def).forEach(function(k) {
    if(k === 'type' || k === 'output') return;
    tx.param(k, def[k]);
  });

  return tx;
}

module.exports = parseTransforms;

var keys = dl.keys(transforms)
  .filter(function(k) { return transforms[k].schema; });

var defs = keys.reduce(function(acc, k) {
  return (acc[k+'Transform'] = transforms[k].schema, acc);
}, {});

parseTransforms.schema = {
  "defs": dl.extend(defs, {
    "transform": {
      "type": "array",
      "items": {
        "oneOf": keys.map(function(k) {
          return {"$ref": "#/defs/"+k+"Transform"};
        })
      }
    }
  })
};


/***/ }),

/***/ "F9eC":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var config_1 = __webpack_require__("Py5Z");
var encoding_1 = __webpack_require__("QSMf");
var mark_1 = __webpack_require__("j8cM");
var stack_1 = __webpack_require__("f2i1");
var channel_1 = __webpack_require__("P/aK");
var vlEncoding = __webpack_require__("QSMf");
var util_1 = __webpack_require__("ZAUf");
function isFacetSpec(spec) {
    return spec['facet'] !== undefined;
}
exports.isFacetSpec = isFacetSpec;
function isExtendedUnitSpec(spec) {
    if (isSomeUnitSpec(spec)) {
        var hasRow = encoding_1.has(spec.encoding, channel_1.ROW);
        var hasColumn = encoding_1.has(spec.encoding, channel_1.COLUMN);
        return hasRow || hasColumn;
    }
    return false;
}
exports.isExtendedUnitSpec = isExtendedUnitSpec;
function isUnitSpec(spec) {
    if (isSomeUnitSpec(spec)) {
        return !isExtendedUnitSpec(spec);
    }
    return false;
}
exports.isUnitSpec = isUnitSpec;
function isSomeUnitSpec(spec) {
    return spec['mark'] !== undefined;
}
exports.isSomeUnitSpec = isSomeUnitSpec;
function isLayerSpec(spec) {
    return spec['layers'] !== undefined;
}
exports.isLayerSpec = isLayerSpec;
function normalize(spec) {
    if (isExtendedUnitSpec(spec)) {
        return normalizeExtendedUnitSpec(spec);
    }
    if (isUnitSpec(spec)) {
        return normalizeUnitSpec(spec);
    }
    return spec;
}
exports.normalize = normalize;
function normalizeExtendedUnitSpec(spec) {
    var hasRow = encoding_1.has(spec.encoding, channel_1.ROW);
    var hasColumn = encoding_1.has(spec.encoding, channel_1.COLUMN);
    var encoding = util_1.duplicate(spec.encoding);
    delete encoding.column;
    delete encoding.row;
    return util_1.extend(spec.name ? { name: spec.name } : {}, spec.description ? { description: spec.description } : {}, { data: spec.data }, spec.transform ? { transform: spec.transform } : {}, {
        facet: util_1.extend(hasRow ? { row: spec.encoding.row } : {}, hasColumn ? { column: spec.encoding.column } : {}),
        spec: normalizeUnitSpec({
            mark: spec.mark,
            encoding: encoding
        })
    }, spec.config ? { config: spec.config } : {});
}
exports.normalizeExtendedUnitSpec = normalizeExtendedUnitSpec;
function normalizeUnitSpec(spec) {
    var config = spec.config;
    var overlayConfig = config && config.overlay;
    var overlayWithLine = overlayConfig && spec.mark === mark_1.AREA &&
        util_1.contains([config_1.AreaOverlay.LINEPOINT, config_1.AreaOverlay.LINE], overlayConfig.area);
    var overlayWithPoint = overlayConfig && ((overlayConfig.line && spec.mark === mark_1.LINE) ||
        (overlayConfig.area === config_1.AreaOverlay.LINEPOINT && spec.mark === mark_1.AREA));
    if (spec.mark === mark_1.ERRORBAR) {
        return normalizeErrorBarUnitSpec(spec);
    }
    if (encoding_1.isRanged(spec.encoding)) {
        return normalizeRangedUnitSpec(spec);
    }
    if (isStacked(spec)) {
        return spec;
    }
    if (overlayWithPoint || overlayWithLine) {
        return normalizeOverlay(spec, overlayWithPoint, overlayWithLine);
    }
    return spec;
}
exports.normalizeUnitSpec = normalizeUnitSpec;
function normalizeRangedUnitSpec(spec) {
    if (spec.encoding) {
        var hasX = encoding_1.has(spec.encoding, channel_1.X);
        var hasY = encoding_1.has(spec.encoding, channel_1.Y);
        var hasX2 = encoding_1.has(spec.encoding, channel_1.X2);
        var hasY2 = encoding_1.has(spec.encoding, channel_1.Y2);
        if ((hasX2 && !hasX) || (hasY2 && !hasY)) {
            var normalizedSpec = util_1.duplicate(spec);
            if (hasX2 && !hasX) {
                normalizedSpec.encoding.x = normalizedSpec.encoding.x2;
                delete normalizedSpec.encoding.x2;
            }
            if (hasY2 && !hasY) {
                normalizedSpec.encoding.y = normalizedSpec.encoding.y2;
                delete normalizedSpec.encoding.y2;
            }
            return normalizedSpec;
        }
    }
    return spec;
}
exports.normalizeRangedUnitSpec = normalizeRangedUnitSpec;
function normalizeErrorBarUnitSpec(spec) {
    var layerSpec = util_1.extend(spec.name ? { name: spec.name } : {}, spec.description ? { description: spec.description } : {}, spec.data ? { data: spec.data } : {}, spec.transform ? { transform: spec.transform } : {}, spec.config ? { config: spec.config } : {}, { layers: [] });
    if (!spec.encoding) {
        return layerSpec;
    }
    if (spec.mark === mark_1.ERRORBAR) {
        var ruleSpec = {
            mark: mark_1.RULE,
            encoding: util_1.extend(spec.encoding.x ? { x: util_1.duplicate(spec.encoding.x) } : {}, spec.encoding.y ? { y: util_1.duplicate(spec.encoding.y) } : {}, spec.encoding.x2 ? { x2: util_1.duplicate(spec.encoding.x2) } : {}, spec.encoding.y2 ? { y2: util_1.duplicate(spec.encoding.y2) } : {}, {})
        };
        var lowerTickSpec = {
            mark: mark_1.TICK,
            encoding: util_1.extend(spec.encoding.x ? { x: util_1.duplicate(spec.encoding.x) } : {}, spec.encoding.y ? { y: util_1.duplicate(spec.encoding.y) } : {}, spec.encoding.size ? { size: util_1.duplicate(spec.encoding.size) } : {}, {})
        };
        var upperTickSpec = {
            mark: mark_1.TICK,
            encoding: util_1.extend({
                x: spec.encoding.x2 ? util_1.duplicate(spec.encoding.x2) : util_1.duplicate(spec.encoding.x),
                y: spec.encoding.y2 ? util_1.duplicate(spec.encoding.y2) : util_1.duplicate(spec.encoding.y)
            }, spec.encoding.size ? { size: util_1.duplicate(spec.encoding.size) } : {})
        };
        layerSpec.layers.push(normalizeUnitSpec(ruleSpec));
        layerSpec.layers.push(normalizeUnitSpec(lowerTickSpec));
        layerSpec.layers.push(normalizeUnitSpec(upperTickSpec));
    }
    return layerSpec;
}
exports.normalizeErrorBarUnitSpec = normalizeErrorBarUnitSpec;
function normalizeOverlay(spec, overlayWithPoint, overlayWithLine) {
    var outerProps = ['name', 'description', 'data', 'transform'];
    var baseSpec = util_1.omit(spec, outerProps.concat('config'));
    var baseConfig = util_1.duplicate(spec.config);
    delete baseConfig.overlay;
    var layerSpec = util_1.extend(util_1.pick(spec, outerProps), { layers: [baseSpec] }, util_1.keys(baseConfig).length > 0 ? { config: baseConfig } : {});
    if (overlayWithLine) {
        var lineSpec = util_1.duplicate(baseSpec);
        lineSpec.mark = mark_1.LINE;
        var markConfig = util_1.extend({}, config_1.defaultOverlayConfig.lineStyle, spec.config.overlay.lineStyle);
        if (util_1.keys(markConfig).length > 0) {
            lineSpec.config = { mark: markConfig };
        }
        layerSpec.layers.push(lineSpec);
    }
    if (overlayWithPoint) {
        var pointSpec = util_1.duplicate(baseSpec);
        pointSpec.mark = mark_1.POINT;
        var markConfig = util_1.extend({}, config_1.defaultOverlayConfig.pointStyle, spec.config.overlay.pointStyle);
        ;
        if (util_1.keys(markConfig).length > 0) {
            pointSpec.config = { mark: markConfig };
        }
        layerSpec.layers.push(pointSpec);
    }
    return layerSpec;
}
exports.normalizeOverlay = normalizeOverlay;
function alwaysNoOcclusion(spec) {
    return vlEncoding.isAggregate(spec.encoding);
}
exports.alwaysNoOcclusion = alwaysNoOcclusion;
function fieldDefs(spec) {
    return vlEncoding.fieldDefs(spec.encoding);
}
exports.fieldDefs = fieldDefs;
;
function getCleanSpec(spec) {
    return spec;
}
exports.getCleanSpec = getCleanSpec;
function isStacked(spec) {
    return stack_1.stack(spec.mark, spec.encoding, spec.config) !== null;
}
exports.isStacked = isStacked;
function transpose(spec) {
    var oldenc = spec.encoding;
    var encoding = util_1.duplicate(spec.encoding);
    encoding.x = oldenc.y;
    encoding.y = oldenc.x;
    encoding.row = oldenc.column;
    encoding.column = oldenc.row;
    spec.encoding = encoding;
    return spec;
}
exports.transpose = transpose;
//# sourceMappingURL=spec.js.map

/***/ }),

/***/ "FmT5":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
function autoMaxBins(channel) {
    switch (channel) {
        case channel_1.ROW:
        case channel_1.COLUMN:
        case channel_1.SIZE:
        case channel_1.SHAPE:
            return 6;
        default:
            return 10;
    }
}
exports.autoMaxBins = autoMaxBins;
//# sourceMappingURL=bin.js.map

/***/ }),

/***/ "Fw/k":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (ScaleType) {
    ScaleType[ScaleType["LINEAR"] = 'linear'] = "LINEAR";
    ScaleType[ScaleType["LOG"] = 'log'] = "LOG";
    ScaleType[ScaleType["POW"] = 'pow'] = "POW";
    ScaleType[ScaleType["SQRT"] = 'sqrt'] = "SQRT";
    ScaleType[ScaleType["QUANTILE"] = 'quantile'] = "QUANTILE";
    ScaleType[ScaleType["QUANTIZE"] = 'quantize'] = "QUANTIZE";
    ScaleType[ScaleType["ORDINAL"] = 'ordinal'] = "ORDINAL";
    ScaleType[ScaleType["TIME"] = 'time'] = "TIME";
    ScaleType[ScaleType["UTC"] = 'utc'] = "UTC";
})(exports.ScaleType || (exports.ScaleType = {}));
var ScaleType = exports.ScaleType;
(function (NiceTime) {
    NiceTime[NiceTime["SECOND"] = 'second'] = "SECOND";
    NiceTime[NiceTime["MINUTE"] = 'minute'] = "MINUTE";
    NiceTime[NiceTime["HOUR"] = 'hour'] = "HOUR";
    NiceTime[NiceTime["DAY"] = 'day'] = "DAY";
    NiceTime[NiceTime["WEEK"] = 'week'] = "WEEK";
    NiceTime[NiceTime["MONTH"] = 'month'] = "MONTH";
    NiceTime[NiceTime["YEAR"] = 'year'] = "YEAR";
})(exports.NiceTime || (exports.NiceTime = {}));
var NiceTime = exports.NiceTime;
exports.defaultScaleConfig = {
    round: true,
    textBandWidth: 90,
    bandSize: 21,
    padding: 1,
    useRawDomain: false,
    opacity: [0.3, 0.8],
    nominalColorRange: 'category10',
    sequentialColorRange: ['#AFC6A3', '#09622A'],
    shapeRange: 'shapes',
    fontSizeRange: [8, 40],
    ruleSizeRange: [1, 5],
    tickSizeRange: [1, 20]
};
exports.defaultFacetScaleConfig = {
    round: true,
    padding: 16
};
//# sourceMappingURL=scale.js.map

/***/ }),

/***/ "G+HP":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var common_1 = __webpack_require__("MtYt");
var fielddef_1 = __webpack_require__("o+e1");
var type_1 = __webpack_require__("WJ2w");
var text;
(function (text_1) {
    function markType() {
        return 'text';
    }
    text_1.markType = markType;
    function background(model) {
        return {
            x: { value: 0 },
            y: { value: 0 },
            width: { field: { group: 'width' } },
            height: { field: { group: 'height' } },
            fill: {
                scale: model.scaleName(channel_1.COLOR),
                field: model.field(channel_1.COLOR, model.fieldDef(channel_1.COLOR).type === type_1.ORDINAL ? { prefn: 'rank_' } : {})
            }
        };
    }
    text_1.background = background;
    function properties(model) {
        var p = {};
        common_1.applyMarkConfig(p, model, ['angle', 'align', 'baseline', 'dx', 'dy', 'font', 'fontWeight',
            'fontStyle', 'radius', 'theta', 'text']);
        var config = model.config();
        var textFieldDef = model.fieldDef(channel_1.TEXT);
        p.x = x(model.encoding().x, model.scaleName(channel_1.X), config, textFieldDef);
        p.y = y(model.encoding().y, model.scaleName(channel_1.Y), config);
        p.fontSize = size(model.encoding().size, model.scaleName(channel_1.SIZE), config);
        p.text = text(model.encoding().text, model.scaleName(channel_1.TEXT), config);
        if (model.config().mark.applyColorToBackground && !model.has(channel_1.X) && !model.has(channel_1.Y)) {
            p.fill = { value: 'black' };
            var opacity = model.config().mark.opacity;
            if (opacity) {
                p.opacity = { value: opacity };
            }
            ;
        }
        else {
            common_1.applyColorAndOpacity(p, model);
        }
        return p;
    }
    text_1.properties = properties;
    function x(xFieldDef, scaleName, config, textFieldDef) {
        if (xFieldDef) {
            if (xFieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(xFieldDef, { binSuffix: '_mid' })
                };
            }
        }
        if (textFieldDef && textFieldDef.type === type_1.QUANTITATIVE) {
            return { field: { group: 'width' }, offset: -5 };
        }
        else {
            return { value: config.scale.textBandWidth / 2 };
        }
    }
    function y(yFieldDef, scaleName, config) {
        if (yFieldDef) {
            if (yFieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(yFieldDef, { binSuffix: '_mid' })
                };
            }
        }
        return { value: config.scale.bandSize / 2 };
    }
    function size(sizeFieldDef, scaleName, config) {
        if (sizeFieldDef) {
            if (sizeFieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(sizeFieldDef)
                };
            }
            if (sizeFieldDef.value) {
                return { value: sizeFieldDef.value };
            }
        }
        return { value: config.mark.fontSize };
    }
    function text(textFieldDef, scaleName, config) {
        if (textFieldDef) {
            if (textFieldDef.field) {
                if (type_1.QUANTITATIVE === textFieldDef.type) {
                    var format = common_1.numberFormat(textFieldDef, config.mark.format, config);
                    var filter = 'number' + (format ? ':\'' + format + '\'' : '');
                    return {
                        template: '{{' + fielddef_1.field(textFieldDef, { datum: true }) + ' | ' + filter + '}}'
                    };
                }
                else if (type_1.TEMPORAL === textFieldDef.type) {
                    return {
                        template: common_1.timeTemplate(fielddef_1.field(textFieldDef, { datum: true }), textFieldDef.timeUnit, config.mark.format, config.mark.shortTimeLabels, config)
                    };
                }
                else {
                    return { field: textFieldDef.field };
                }
            }
            else if (textFieldDef.value) {
                return { value: textFieldDef.value };
            }
        }
        return { value: config.mark.text };
    }
})(text = exports.text || (exports.text = {}));
//# sourceMappingURL=text.js.map

/***/ }),

/***/ "GXXi":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    d3 = __webpack_require__("Za4h"),
    d3_cloud = __webpack_require__("NobO"),
    canvas = __webpack_require__("LHV8").canvas,
    Tuple = __webpack_require__("gtuQ"),
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Wordcloud(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    size: {type: 'array<value>', default: __webpack_require__("MRce").size},
    text: {type: 'field', default: 'data'},
    rotate: {type: 'field|value', default: 0},
    font: {type: 'field|value', default: {value: 'sans-serif'}},
    fontSize: {type: 'field|value', default: 14},
    fontStyle: {type: 'field|value', default: {value: 'normal'}},
    fontWeight: {type: 'field|value', default: {value: 'normal'}},
    fontScale: {type: 'array<value>', default: [10, 50]},
    padding: {type: 'value', default: 1},
    spiral: {type: 'value', default: 'archimedean'}
  });

  this._layout = d3_cloud().canvas(canvas.instance);

  this._output = {
    'x':          'layout_x',
    'y':          'layout_y',
    'font':       'layout_font',
    'fontSize':   'layout_fontSize',
    'fontStyle':  'layout_fontStyle',
    'fontWeight': 'layout_fontWeight',
    'rotate':     'layout_rotate',
  };

  return this.mutates(true);
}

var prototype = (Wordcloud.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Wordcloud;

function get(p) {
  return (p && p.accessor) || p;
}

function wrap(tuple) {
  var x = Object.create(tuple);
  x._tuple = tuple;
  return x;
}

prototype.batchTransform = function(input, data) {
  log.debug(input, ['wordcloud']);

  // get variables
  var layout = this._layout,
      output = this._output,
      fontSize = this.param('fontSize'),
      range = fontSize.accessor && this.param('fontScale'),
      size, scale;
  fontSize = fontSize.accessor || d3.functor(fontSize);

  // create font size scaling function as needed
  if (range.length) {
    scale = d3.scale.sqrt()
      .domain(dl.extent(data, size=fontSize))
      .range(range);
    fontSize = function(x) { return scale(size(x)); };
  }

  // configure layout
  layout
    .size(this.param('size'))
    .text(get(this.param('text')))
    .padding(this.param('padding'))
    .spiral(this.param('spiral'))
    .rotate(get(this.param('rotate')))
    .font(get(this.param('font')))
    .fontStyle(get(this.param('fontStyle')))
    .fontWeight(get(this.param('fontWeight')))
    .fontSize(fontSize)
    .words(data.map(wrap)) // wrap to avoid tuple writes
    .on('end', function(words) {
      var size = layout.size(),
          dx = size[0] >> 1,
          dy = size[1] >> 1,
          w, t, i, len;

      for (i=0, len=words.length; i<len; ++i) {
        w = words[i];
        t = w._tuple;
        Tuple.set(t, output.x, w.x + dx);
        Tuple.set(t, output.y, w.y + dy);
        Tuple.set(t, output.font, w.font);
        Tuple.set(t, output.fontSize, w.size);
        Tuple.set(t, output.fontStyle, w.style);
        Tuple.set(t, output.fontWeight, w.weight);
        Tuple.set(t, output.rotate, w.rotate);
      }
    })
    .start();

  // return changeset
  for (var key in output) input.fields[output[key]] = 1;
  return input;
};

module.exports = Wordcloud;

var Parameter = __webpack_require__("fRRI");
Wordcloud.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Wordcloud transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["wordcloud"]},
    "size": {
      "description": "The dimensions of the wordcloud layout",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
          "minItems": 2,
          "maxItems": 2
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": [900, 500]
    },
    "font": {
      "description": "The font face to use for a word.",
      "oneOf": [{"type": "string"}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": "sans-serif"
    },
    "fontStyle": {
      "description": "The font style to use for a word.",
      "oneOf": [{"type": "string"}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": "normal"
    },
    "fontWeight": {
      "description": "The font weight to use for a word.",
      "oneOf": [{"type": "string"}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": "normal"
    },
    "fontSize": {
      "description": "The font size to use for a word.",
      "oneOf": [{"type": "number"}, Parameter.schema, {"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": 14
    },
    "fontScale": {
      "description": "The minimum and maximum scaled font sizes, or null to prevent scaling.",
      "oneOf": [
        { "type": "null" },
        {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {"oneOf": [{"type":"number"}, {"$ref": "#/refs/signal"}]}
        }
      ],
      "default": [10, 50]
    },
    "rotate": {
      "description": "The field or number to set the roration angle (in degrees).",
      "oneOf": [
        {"type": "number"}, {"type": "string"},
        Parameter.schema, {"$ref": "#/refs/signal"}
      ],
      "default": 0
    },
    "text": {
      "description": "The field containing the text to use for each word.",
      "oneOf": [{"type": "string"}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": 'data'
    },
    "spiral": {
      "description": "The type of spiral used for positioning words, either 'archimedean' or 'rectangular'.",
      "oneOf": [{"enum": ["archimedean", "rectangular"]}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": "archimedean"
    },
    "padding": {
      "description": "The padding around each word.",
      "oneOf": [{"type": "number"}, Parameter.schema, {"$ref": "#/refs/signal"}],
      "default": 1
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "x": {"type": "string", "default": "layout_x"},
        "y": {"type": "string", "default": "layout_y"},
        "font": {"type": "string", "default": "layout_font"},
        "fontSize": {"type": "string", "default": "layout_fontSize"},
        "fontStyle": {"type": "string", "default": "layout_fontStyle"},
        "fontWeight": {"type": "string", "default": "layout_fontWeight"},
        "rotate": {"type": "string", "default": "layout_rotate"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "GXhC":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    d3_time = __webpack_require__("aZ75"),
    d3_timeF = __webpack_require__("bZsP"),
    d3_numberF = __webpack_require__("1/F5"),
    numberF = d3_numberF, // defaults to EN-US
    timeF = d3_timeF,     // defaults to EN-US
    tmpDate = new Date(2000, 0, 1),
    monthFull, monthAbbr, dayFull, dayAbbr;


module.exports = {
  // Update number formatter to use provided locale configuration.
  // For more see https://github.com/d3/d3-format
  numberLocale: numberLocale,
  number:       function(f) { return numberF.format(f); },
  numberPrefix: function(f, v) { return numberF.formatPrefix(f, v); },

  // Update time formatter to use provided locale configuration.
  // For more see https://github.com/d3/d3-time-format
  timeLocale:   timeLocale,
  time:         function(f) { return timeF.format(f); },
  utc:          function(f) { return timeF.utcFormat(f); },

  // Set number and time locale simultaneously.
  locale:       function(l) { numberLocale(l); timeLocale(l); },

  // automatic formatting functions
  auto: {
    number:   autoNumberFormat,
    linear:   linearNumberFormat,
    time:     function() { return timeAutoFormat(); },
    utc:      function() { return utcAutoFormat(); }
  },

  month:      monthFormat,      // format month name from integer code
  day:        dayFormat,        // format week day name from integer code
  quarter:    quarterFormat,    // format quarter name from timestamp
  utcQuarter: utcQuarterFormat  // format quarter name from utc timestamp
};

// -- Locales ----

// transform 'en-US' style locale string to match d3-format v0.4+ convention
function localeRef(l) {
  return l.length > 4 && 'locale' + (
    l[0].toUpperCase() + l[1].toLowerCase() +
    l[3].toUpperCase() + l[4].toLowerCase()
  );
}

function numberLocale(l) {
  var f = util.isString(l) ? d3_numberF[localeRef(l)] : d3_numberF.locale(l);
  if (f == null) throw Error('Unrecognized locale: ' + l);
  numberF = f;
}

function timeLocale(l) {
  var f = util.isString(l) ? d3_timeF[localeRef(l)] : d3_timeF.locale(l);
  if (f == null) throw Error('Unrecognized locale: ' + l);
  timeF = f;
  monthFull = monthAbbr = dayFull = dayAbbr = null;
}

// -- Number Formatting ----

var e10 = Math.sqrt(50),
    e5 = Math.sqrt(10),
    e2 = Math.sqrt(2);

function linearRange(domain, count) {
  if (!domain.length) domain = [0];
  if (count == null) count = 10;

  var start = domain[0],
      stop = domain[domain.length - 1];

  if (stop < start) { error = stop; stop = start; start = error; }

  var span = (stop - start) || (count = 1, start || stop || 1),
      step = Math.pow(10, Math.floor(Math.log(span / count) / Math.LN10)),
      error = span / count / step;

  // Filter ticks to get closer to the desired count.
  if (error >= e10) step *= 10;
  else if (error >= e5) step *= 5;
  else if (error >= e2) step *= 2;

  // Round start and stop values to step interval.
  return [
    Math.ceil(start / step) * step,
    Math.floor(stop / step) * step + step / 2, // inclusive
    step
  ];
}

function trimZero(f, decimal) {
  return function(x) {
    var s = f(x),
        n = s.indexOf(decimal);
    if (n < 0) return s;

    var idx = rightmostDigit(s, n),
        end = idx < s.length ? s.slice(idx) : '';

    while (--idx > n) {
      if (s[idx] !== '0') { ++idx; break; }
    }
    return s.slice(0, idx) + end;
  };
}

function rightmostDigit(s, n) {
  var i = s.lastIndexOf('e'), c;
  if (i > 0) return i;
  for (i=s.length; --i > n;) {
    c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) return i+1; // is digit
  }
}

function autoNumberFormat(f) {
  var decimal = numberF.format('.1f')(1)[1]; // get decimal char
  if (f == null) f = ',';
  f = d3_numberF.formatSpecifier(f);
  if (f.precision == null) f.precision = 12;
  switch (f.type) {
    case '%': f.precision -= 2; break;
    case 'e': f.precision -= 1; break;
  }
  return trimZero(numberF.format(f), decimal);
}

function linearNumberFormat(domain, count, f) {
  var range = linearRange(domain, count);

  if (f == null) f = ',f';

  switch (f = d3_numberF.formatSpecifier(f), f.type) {
    case 's': {
      var value = Math.max(Math.abs(range[0]), Math.abs(range[1]));
      if (f.precision == null) f.precision = d3_numberF.precisionPrefix(range[2], value);
      return numberF.formatPrefix(f, value);
    }
    case '':
    case 'e':
    case 'g':
    case 'p':
    case 'r': {
      if (f.precision == null) f.precision = d3_numberF.precisionRound(range[2], Math.max(Math.abs(range[0]), Math.abs(range[1]))) - (f.type === 'e');
      break;
    }
    case 'f':
    case '%': {
      if (f.precision == null) f.precision = d3_numberF.precisionFixed(range[2]) - 2 * (f.type === '%');
      break;
    }
  }
  return numberF.format(f);
}

// -- Datetime Formatting ----

function timeAutoFormat() {
  var f = timeF.format,
      formatMillisecond = f('.%L'),
      formatSecond = f(':%S'),
      formatMinute = f('%I:%M'),
      formatHour = f('%I %p'),
      formatDay = f('%a %d'),
      formatWeek = f('%b %d'),
      formatMonth = f('%B'),
      formatYear = f('%Y');

  return function(date) {
    var d = +date;
    return (d3_time.second(date) < d ? formatMillisecond
        : d3_time.minute(date) < d ? formatSecond
        : d3_time.hour(date) < d ? formatMinute
        : d3_time.day(date) < d ? formatHour
        : d3_time.month(date) < d ?
          (d3_time.week(date) < d ? formatDay : formatWeek)
        : d3_time.year(date) < d ? formatMonth
        : formatYear)(date);
  };
}

function utcAutoFormat() {
  var f = timeF.utcFormat,
      formatMillisecond = f('.%L'),
      formatSecond = f(':%S'),
      formatMinute = f('%I:%M'),
      formatHour = f('%I %p'),
      formatDay = f('%a %d'),
      formatWeek = f('%b %d'),
      formatMonth = f('%B'),
      formatYear = f('%Y');

  return function(date) {
    var d = +date;
    return (d3_time.utcSecond(date) < d ? formatMillisecond
        : d3_time.utcMinute(date) < d ? formatSecond
        : d3_time.utcHour(date) < d ? formatMinute
        : d3_time.utcDay(date) < d ? formatHour
        : d3_time.utcMonth(date) < d ?
          (d3_time.utcWeek(date) < d ? formatDay : formatWeek)
        : d3_time.utcYear(date) < d ? formatMonth
        : formatYear)(date);
  };
}

function monthFormat(month, abbreviate) {
  var f = abbreviate ?
    (monthAbbr || (monthAbbr = timeF.format('%b'))) :
    (monthFull || (monthFull = timeF.format('%B')));
  return (tmpDate.setMonth(month), f(tmpDate));
}

function dayFormat(day, abbreviate) {
  var f = abbreviate ?
    (dayAbbr || (dayAbbr = timeF.format('%a'))) :
    (dayFull || (dayFull = timeF.format('%A')));
  return (tmpDate.setMonth(0), tmpDate.setDate(2 + day), f(tmpDate));
}

function quarterFormat(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function utcQuarterFormat(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}


/***/ }),

/***/ "H3bJ":
/***/ (function(module, exports) {

/*
  The following expression parser is based on Esprima (http://esprima.org/).
  Original header comment and license for Esprima is included here:

  Copyright (C) 2013 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2013 Thaddee Tyl <thaddee.tyl@gmail.com>
  Copyright (C) 2013 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>
  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/* istanbul ignore next */
module.exports = (function() {
  'use strict';

  var Token,
      TokenName,
      Syntax,
      PropertyKind,
      Messages,
      Regex,
      source,
      strict,
      index,
      lineNumber,
      lineStart,
      length,
      lookahead,
      state,
      extra;

  Token = {
      BooleanLiteral: 1,
      EOF: 2,
      Identifier: 3,
      Keyword: 4,
      NullLiteral: 5,
      NumericLiteral: 6,
      Punctuator: 7,
      StringLiteral: 8,
      RegularExpression: 9
  };

  TokenName = {};
  TokenName[Token.BooleanLiteral] = 'Boolean';
  TokenName[Token.EOF] = '<end>';
  TokenName[Token.Identifier] = 'Identifier';
  TokenName[Token.Keyword] = 'Keyword';
  TokenName[Token.NullLiteral] = 'Null';
  TokenName[Token.NumericLiteral] = 'Numeric';
  TokenName[Token.Punctuator] = 'Punctuator';
  TokenName[Token.StringLiteral] = 'String';
  TokenName[Token.RegularExpression] = 'RegularExpression';

  Syntax = {
      AssignmentExpression: 'AssignmentExpression',
      ArrayExpression: 'ArrayExpression',
      BinaryExpression: 'BinaryExpression',
      CallExpression: 'CallExpression',
      ConditionalExpression: 'ConditionalExpression',
      ExpressionStatement: 'ExpressionStatement',
      Identifier: 'Identifier',
      Literal: 'Literal',
      LogicalExpression: 'LogicalExpression',
      MemberExpression: 'MemberExpression',
      ObjectExpression: 'ObjectExpression',
      Program: 'Program',
      Property: 'Property',
      UnaryExpression: 'UnaryExpression'
  };

  PropertyKind = {
      Data: 1,
      Get: 2,
      Set: 4
  };

  // Error messages should be identical to V8.
  Messages = {
      UnexpectedToken:  'Unexpected token %0',
      UnexpectedNumber:  'Unexpected number',
      UnexpectedString:  'Unexpected string',
      UnexpectedIdentifier:  'Unexpected identifier',
      UnexpectedReserved:  'Unexpected reserved word',
      UnexpectedEOS:  'Unexpected end of input',
      NewlineAfterThrow:  'Illegal newline after throw',
      InvalidRegExp: 'Invalid regular expression',
      UnterminatedRegExp:  'Invalid regular expression: missing /',
      InvalidLHSInAssignment:  'Invalid left-hand side in assignment',
      InvalidLHSInForIn:  'Invalid left-hand side in for-in',
      MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
      NoCatchOrFinally:  'Missing catch or finally after try',
      UnknownLabel: 'Undefined label \'%0\'',
      Redeclaration: '%0 \'%1\' has already been declared',
      IllegalContinue: 'Illegal continue statement',
      IllegalBreak: 'Illegal break statement',
      IllegalReturn: 'Illegal return statement',
      StrictModeWith:  'Strict mode code may not include a with statement',
      StrictCatchVariable:  'Catch variable may not be eval or arguments in strict mode',
      StrictVarName:  'Variable name may not be eval or arguments in strict mode',
      StrictParamName:  'Parameter name eval or arguments is not allowed in strict mode',
      StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
      StrictFunctionName:  'Function name may not be eval or arguments in strict mode',
      StrictOctalLiteral:  'Octal literals are not allowed in strict mode.',
      StrictDelete:  'Delete of an unqualified identifier in strict mode.',
      StrictDuplicateProperty:  'Duplicate data property in object literal not allowed in strict mode',
      AccessorDataProperty:  'Object literal may not have data and accessor property with the same name',
      AccessorGetSet:  'Object literal may not have multiple get/set accessors with the same name',
      StrictLHSAssignment:  'Assignment to eval or arguments is not allowed in strict mode',
      StrictLHSPostfix:  'Postfix increment/decrement may not have eval or arguments operand in strict mode',
      StrictLHSPrefix:  'Prefix increment/decrement may not have eval or arguments operand in strict mode',
      StrictReservedWord:  'Use of future reserved word in strict mode'
  };

  // See also tools/generate-unicode-regex.py.
  Regex = {
      NonAsciiIdentifierStart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B2\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]'),
      NonAsciiIdentifierPart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B2\u08E4-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA69D\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA7AD\uA7B0\uA7B1\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB5F\uAB64\uAB65\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2D\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]')
  };

  // Ensure the condition is true, otherwise throw an error.
  // This is only to have a better contract semantic, i.e. another safety net
  // to catch a logic error. The condition shall be fulfilled in normal case.
  // Do NOT use this to enforce a certain condition on any user input.

  function assert(condition, message) {
      if (!condition) {
          throw new Error('ASSERT: ' + message);
      }
  }

  function isDecimalDigit(ch) {
      return (ch >= 0x30 && ch <= 0x39);   // 0..9
  }

  function isHexDigit(ch) {
      return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
  }

  function isOctalDigit(ch) {
      return '01234567'.indexOf(ch) >= 0;
  }

  // 7.2 White Space

  function isWhiteSpace(ch) {
      return (ch === 0x20) || (ch === 0x09) || (ch === 0x0B) || (ch === 0x0C) || (ch === 0xA0) ||
          (ch >= 0x1680 && [0x1680, 0x180E, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0xFEFF].indexOf(ch) >= 0);
  }

  // 7.3 Line Terminators

  function isLineTerminator(ch) {
      return (ch === 0x0A) || (ch === 0x0D) || (ch === 0x2028) || (ch === 0x2029);
  }

  // 7.6 Identifier Names and Identifiers

  function isIdentifierStart(ch) {
      return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
          (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
          (ch >= 0x61 && ch <= 0x7A) ||         // a..z
          (ch === 0x5C) ||                      // \ (backslash)
          ((ch >= 0x80) && Regex.NonAsciiIdentifierStart.test(String.fromCharCode(ch)));
  }

  function isIdentifierPart(ch) {
      return (ch === 0x24) || (ch === 0x5F) ||  // $ (dollar) and _ (underscore)
          (ch >= 0x41 && ch <= 0x5A) ||         // A..Z
          (ch >= 0x61 && ch <= 0x7A) ||         // a..z
          (ch >= 0x30 && ch <= 0x39) ||         // 0..9
          (ch === 0x5C) ||                      // \ (backslash)
          ((ch >= 0x80) && Regex.NonAsciiIdentifierPart.test(String.fromCharCode(ch)));
  }

  // 7.6.1.2 Future Reserved Words

  function isFutureReservedWord(id) {
      switch (id) {
      case 'class':
      case 'enum':
      case 'export':
      case 'extends':
      case 'import':
      case 'super':
          return true;
      default:
          return false;
      }
  }

  function isStrictModeReservedWord(id) {
      switch (id) {
      case 'implements':
      case 'interface':
      case 'package':
      case 'private':
      case 'protected':
      case 'public':
      case 'static':
      case 'yield':
      case 'let':
          return true;
      default:
          return false;
      }
  }

  // 7.6.1.1 Keywords

  function isKeyword(id) {
      if (strict && isStrictModeReservedWord(id)) {
          return true;
      }

      // 'const' is specialized as Keyword in V8.
      // 'yield' and 'let' are for compatiblity with SpiderMonkey and ES.next.
      // Some others are from future reserved words.

      switch (id.length) {
      case 2:
          return (id === 'if') || (id === 'in') || (id === 'do');
      case 3:
          return (id === 'var') || (id === 'for') || (id === 'new') ||
              (id === 'try') || (id === 'let');
      case 4:
          return (id === 'this') || (id === 'else') || (id === 'case') ||
              (id === 'void') || (id === 'with') || (id === 'enum');
      case 5:
          return (id === 'while') || (id === 'break') || (id === 'catch') ||
              (id === 'throw') || (id === 'const') || (id === 'yield') ||
              (id === 'class') || (id === 'super');
      case 6:
          return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
              (id === 'switch') || (id === 'export') || (id === 'import');
      case 7:
          return (id === 'default') || (id === 'finally') || (id === 'extends');
      case 8:
          return (id === 'function') || (id === 'continue') || (id === 'debugger');
      case 10:
          return (id === 'instanceof');
      default:
          return false;
      }
  }

  function skipComment() {
      var ch, start;

      start = (index === 0);
      while (index < length) {
          ch = source.charCodeAt(index);

          if (isWhiteSpace(ch)) {
              ++index;
          } else if (isLineTerminator(ch)) {
              ++index;
              if (ch === 0x0D && source.charCodeAt(index) === 0x0A) {
                  ++index;
              }
              ++lineNumber;
              lineStart = index;
              start = true;
          } else {
              break;
          }
      }
  }

  function scanHexEscape(prefix) {
      var i, len, ch, code = 0;

      len = (prefix === 'u') ? 4 : 2;
      for (i = 0; i < len; ++i) {
          if (index < length && isHexDigit(source[index])) {
              ch = source[index++];
              code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
          } else {
              return '';
          }
      }
      return String.fromCharCode(code);
  }

  function scanUnicodeCodePointEscape() {
      var ch, code, cu1, cu2;

      ch = source[index];
      code = 0;

      // At least, one hex digit is required.
      if (ch === '}') {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      while (index < length) {
          ch = source[index++];
          if (!isHexDigit(ch)) {
              break;
          }
          code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
      }

      if (code > 0x10FFFF || ch !== '}') {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      // UTF-16 Encoding
      if (code <= 0xFFFF) {
          return String.fromCharCode(code);
      }
      cu1 = ((code - 0x10000) >> 10) + 0xD800;
      cu2 = ((code - 0x10000) & 1023) + 0xDC00;
      return String.fromCharCode(cu1, cu2);
  }

  function getEscapedIdentifier() {
      var ch, id;

      ch = source.charCodeAt(index++);
      id = String.fromCharCode(ch);

      // '\u' (U+005C, U+0075) denotes an escaped character.
      if (ch === 0x5C) {
          if (source.charCodeAt(index) !== 0x75) {
              throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
          }
          ++index;
          ch = scanHexEscape('u');
          if (!ch || ch === '\\' || !isIdentifierStart(ch.charCodeAt(0))) {
              throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
          }
          id = ch;
      }

      while (index < length) {
          ch = source.charCodeAt(index);
          if (!isIdentifierPart(ch)) {
              break;
          }
          ++index;
          id += String.fromCharCode(ch);

          // '\u' (U+005C, U+0075) denotes an escaped character.
          if (ch === 0x5C) {
              id = id.substr(0, id.length - 1);
              if (source.charCodeAt(index) !== 0x75) {
                  throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
              }
              ++index;
              ch = scanHexEscape('u');
              if (!ch || ch === '\\' || !isIdentifierPart(ch.charCodeAt(0))) {
                  throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
              }
              id += ch;
          }
      }

      return id;
  }

  function getIdentifier() {
      var start, ch;

      start = index++;
      while (index < length) {
          ch = source.charCodeAt(index);
          if (ch === 0x5C) {
              // Blackslash (U+005C) marks Unicode escape sequence.
              index = start;
              return getEscapedIdentifier();
          }
          if (isIdentifierPart(ch)) {
              ++index;
          } else {
              break;
          }
      }

      return source.slice(start, index);
  }

  function scanIdentifier() {
      var start, id, type;

      start = index;

      // Backslash (U+005C) starts an escaped character.
      id = (source.charCodeAt(index) === 0x5C) ? getEscapedIdentifier() : getIdentifier();

      // There is no keyword or literal with only one character.
      // Thus, it must be an identifier.
      if (id.length === 1) {
          type = Token.Identifier;
      } else if (isKeyword(id)) {
          type = Token.Keyword;
      } else if (id === 'null') {
          type = Token.NullLiteral;
      } else if (id === 'true' || id === 'false') {
          type = Token.BooleanLiteral;
      } else {
          type = Token.Identifier;
      }

      return {
          type: type,
          value: id,
          lineNumber: lineNumber,
          lineStart: lineStart,
          start: start,
          end: index
      };
  }

  // 7.7 Punctuators

  function scanPunctuator() {
      var start = index,
          code = source.charCodeAt(index),
          code2,
          ch1 = source[index],
          ch2,
          ch3,
          ch4;

      switch (code) {

      // Check for most common single-character punctuators.
      case 0x2E:  // . dot
      case 0x28:  // ( open bracket
      case 0x29:  // ) close bracket
      case 0x3B:  // ; semicolon
      case 0x2C:  // , comma
      case 0x7B:  // { open curly brace
      case 0x7D:  // } close curly brace
      case 0x5B:  // [
      case 0x5D:  // ]
      case 0x3A:  // :
      case 0x3F:  // ?
      case 0x7E:  // ~
          ++index;
          if (extra.tokenize) {
              if (code === 0x28) {
                  extra.openParenToken = extra.tokens.length;
              } else if (code === 0x7B) {
                  extra.openCurlyToken = extra.tokens.length;
              }
          }
          return {
              type: Token.Punctuator,
              value: String.fromCharCode(code),
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };

      default:
          code2 = source.charCodeAt(index + 1);

          // '=' (U+003D) marks an assignment or comparison operator.
          if (code2 === 0x3D) {
              switch (code) {
              case 0x2B:  // +
              case 0x2D:  // -
              case 0x2F:  // /
              case 0x3C:  // <
              case 0x3E:  // >
              case 0x5E:  // ^
              case 0x7C:  // |
              case 0x25:  // %
              case 0x26:  // &
              case 0x2A:  // *
                  index += 2;
                  return {
                      type: Token.Punctuator,
                      value: String.fromCharCode(code) + String.fromCharCode(code2),
                      lineNumber: lineNumber,
                      lineStart: lineStart,
                      start: start,
                      end: index
                  };

              case 0x21: // !
              case 0x3D: // =
                  index += 2;

                  // !== and ===
                  if (source.charCodeAt(index) === 0x3D) {
                      ++index;
                  }
                  return {
                      type: Token.Punctuator,
                      value: source.slice(start, index),
                      lineNumber: lineNumber,
                      lineStart: lineStart,
                      start: start,
                      end: index
                  };
              }
          }
      }

      // 4-character punctuator: >>>=

      ch4 = source.substr(index, 4);

      if (ch4 === '>>>=') {
          index += 4;
          return {
              type: Token.Punctuator,
              value: ch4,
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };
      }

      // 3-character punctuators: === !== >>> <<= >>=

      ch3 = ch4.substr(0, 3);

      if (ch3 === '>>>' || ch3 === '<<=' || ch3 === '>>=') {
          index += 3;
          return {
              type: Token.Punctuator,
              value: ch3,
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };
      }

      // Other 2-character punctuators: ++ -- << >> && ||
      ch2 = ch3.substr(0, 2);

      if ((ch1 === ch2[1] && ('+-<>&|'.indexOf(ch1) >= 0)) || ch2 === '=>') {
          index += 2;
          return {
              type: Token.Punctuator,
              value: ch2,
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };
      }

      // 1-character punctuators: < > = ! + - * % & | ^ /

      if ('<>=!+-*%&|^/'.indexOf(ch1) >= 0) {
          ++index;
          return {
              type: Token.Punctuator,
              value: ch1,
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };
      }

      throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
  }

  // 7.8.3 Numeric Literals

  function scanHexLiteral(start) {
      var number = '';

      while (index < length) {
          if (!isHexDigit(source[index])) {
              break;
          }
          number += source[index++];
      }

      if (number.length === 0) {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      if (isIdentifierStart(source.charCodeAt(index))) {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      return {
          type: Token.NumericLiteral,
          value: parseInt('0x' + number, 16),
          lineNumber: lineNumber,
          lineStart: lineStart,
          start: start,
          end: index
      };
  }

  function scanOctalLiteral(start) {
      var number = '0' + source[index++];
      while (index < length) {
          if (!isOctalDigit(source[index])) {
              break;
          }
          number += source[index++];
      }

      if (isIdentifierStart(source.charCodeAt(index)) || isDecimalDigit(source.charCodeAt(index))) {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      return {
          type: Token.NumericLiteral,
          value: parseInt(number, 8),
          octal: true,
          lineNumber: lineNumber,
          lineStart: lineStart,
          start: start,
          end: index
      };
  }

  function scanNumericLiteral() {
      var number, start, ch;

      ch = source[index];
      assert(isDecimalDigit(ch.charCodeAt(0)) || (ch === '.'),
          'Numeric literal must start with a decimal digit or a decimal point');

      start = index;
      number = '';
      if (ch !== '.') {
          number = source[index++];
          ch = source[index];

          // Hex number starts with '0x'.
          // Octal number starts with '0'.
          if (number === '0') {
              if (ch === 'x' || ch === 'X') {
                  ++index;
                  return scanHexLiteral(start);
              }
              if (isOctalDigit(ch)) {
                  return scanOctalLiteral(start);
              }

              // decimal number starts with '0' such as '09' is illegal.
              if (ch && isDecimalDigit(ch.charCodeAt(0))) {
                  throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
              }
          }

          while (isDecimalDigit(source.charCodeAt(index))) {
              number += source[index++];
          }
          ch = source[index];
      }

      if (ch === '.') {
          number += source[index++];
          while (isDecimalDigit(source.charCodeAt(index))) {
              number += source[index++];
          }
          ch = source[index];
      }

      if (ch === 'e' || ch === 'E') {
          number += source[index++];

          ch = source[index];
          if (ch === '+' || ch === '-') {
              number += source[index++];
          }
          if (isDecimalDigit(source.charCodeAt(index))) {
              while (isDecimalDigit(source.charCodeAt(index))) {
                  number += source[index++];
              }
          } else {
              throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
          }
      }

      if (isIdentifierStart(source.charCodeAt(index))) {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      return {
          type: Token.NumericLiteral,
          value: parseFloat(number),
          lineNumber: lineNumber,
          lineStart: lineStart,
          start: start,
          end: index
      };
  }

  // 7.8.4 String Literals

  function scanStringLiteral() {
      var str = '', quote, start, ch, code, unescaped, restore, octal = false, startLineNumber, startLineStart;
      startLineNumber = lineNumber;
      startLineStart = lineStart;

      quote = source[index];
      assert((quote === '\'' || quote === '"'),
          'String literal must starts with a quote');

      start = index;
      ++index;

      while (index < length) {
          ch = source[index++];

          if (ch === quote) {
              quote = '';
              break;
          } else if (ch === '\\') {
              ch = source[index++];
              if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
                  switch (ch) {
                  case 'u':
                  case 'x':
                      if (source[index] === '{') {
                          ++index;
                          str += scanUnicodeCodePointEscape();
                      } else {
                          restore = index;
                          unescaped = scanHexEscape(ch);
                          if (unescaped) {
                              str += unescaped;
                          } else {
                              index = restore;
                              str += ch;
                          }
                      }
                      break;
                  case 'n':
                      str += '\n';
                      break;
                  case 'r':
                      str += '\r';
                      break;
                  case 't':
                      str += '\t';
                      break;
                  case 'b':
                      str += '\b';
                      break;
                  case 'f':
                      str += '\f';
                      break;
                  case 'v':
                      str += '\x0B';
                      break;

                  default:
                      if (isOctalDigit(ch)) {
                          code = '01234567'.indexOf(ch);

                          // \0 is not octal escape sequence
                          if (code !== 0) {
                              octal = true;
                          }

                          if (index < length && isOctalDigit(source[index])) {
                              octal = true;
                              code = code * 8 + '01234567'.indexOf(source[index++]);

                              // 3 digits are only allowed when string starts
                              // with 0, 1, 2, 3
                              if ('0123'.indexOf(ch) >= 0 &&
                                      index < length &&
                                      isOctalDigit(source[index])) {
                                  code = code * 8 + '01234567'.indexOf(source[index++]);
                              }
                          }
                          str += String.fromCharCode(code);
                      } else {
                          str += ch;
                      }
                      break;
                  }
              } else {
                  ++lineNumber;
                  if (ch ===  '\r' && source[index] === '\n') {
                      ++index;
                  }
                  lineStart = index;
              }
          } else if (isLineTerminator(ch.charCodeAt(0))) {
              break;
          } else {
              str += ch;
          }
      }

      if (quote !== '') {
          throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
      }

      return {
          type: Token.StringLiteral,
          value: str,
          octal: octal,
          startLineNumber: startLineNumber,
          startLineStart: startLineStart,
          lineNumber: lineNumber,
          lineStart: lineStart,
          start: start,
          end: index
      };
  }

  function testRegExp(pattern, flags) {
      var tmp = pattern,
          value;

      if (flags.indexOf('u') >= 0) {
          // Replace each astral symbol and every Unicode code point
          // escape sequence with a single ASCII symbol to avoid throwing on
          // regular expressions that are only valid in combination with the
          // `/u` flag.
          // Note: replacing with the ASCII symbol `x` might cause false
          // negatives in unlikely scenarios. For example, `[\u{61}-b]` is a
          // perfectly valid pattern that is equivalent to `[a-b]`, but it
          // would be replaced by `[x-b]` which throws an error.
          tmp = tmp
              .replace(/\\u\{([0-9a-fA-F]+)\}/g, function ($0, $1) {
                  if (parseInt($1, 16) <= 0x10FFFF) {
                      return 'x';
                  }
                  throwError({}, Messages.InvalidRegExp);
              })
              .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, 'x');
      }

      // First, detect invalid regular expressions.
      try {
          value = new RegExp(tmp);
      } catch (e) {
          throwError({}, Messages.InvalidRegExp);
      }

      // Return a regular expression object for this pattern-flag pair, or
      // `null` in case the current environment doesn't support the flags it
      // uses.
      try {
          return new RegExp(pattern, flags);
      } catch (exception) {
          return null;
      }
  }

  function scanRegExpBody() {
      var ch, str, classMarker, terminated, body;

      ch = source[index];
      assert(ch === '/', 'Regular expression literal must start with a slash');
      str = source[index++];

      classMarker = false;
      terminated = false;
      while (index < length) {
          ch = source[index++];
          str += ch;
          if (ch === '\\') {
              ch = source[index++];
              // ECMA-262 7.8.5
              if (isLineTerminator(ch.charCodeAt(0))) {
                  throwError({}, Messages.UnterminatedRegExp);
              }
              str += ch;
          } else if (isLineTerminator(ch.charCodeAt(0))) {
              throwError({}, Messages.UnterminatedRegExp);
          } else if (classMarker) {
              if (ch === ']') {
                  classMarker = false;
              }
          } else {
              if (ch === '/') {
                  terminated = true;
                  break;
              } else if (ch === '[') {
                  classMarker = true;
              }
          }
      }

      if (!terminated) {
          throwError({}, Messages.UnterminatedRegExp);
      }

      // Exclude leading and trailing slash.
      body = str.substr(1, str.length - 2);
      return {
          value: body,
          literal: str
      };
  }

  function scanRegExpFlags() {
      var ch, str, flags, restore;

      str = '';
      flags = '';
      while (index < length) {
          ch = source[index];
          if (!isIdentifierPart(ch.charCodeAt(0))) {
              break;
          }

          ++index;
          if (ch === '\\' && index < length) {
              ch = source[index];
              if (ch === 'u') {
                  ++index;
                  restore = index;
                  ch = scanHexEscape('u');
                  if (ch) {
                      flags += ch;
                      for (str += '\\u'; restore < index; ++restore) {
                          str += source[restore];
                      }
                  } else {
                      index = restore;
                      flags += 'u';
                      str += '\\u';
                  }
                  throwErrorTolerant({}, Messages.UnexpectedToken, 'ILLEGAL');
              } else {
                  str += '\\';
                  throwErrorTolerant({}, Messages.UnexpectedToken, 'ILLEGAL');
              }
          } else {
              flags += ch;
              str += ch;
          }
      }

      return {
          value: flags,
          literal: str
      };
  }

  function scanRegExp() {
      var start, body, flags, value;

      lookahead = null;
      skipComment();
      start = index;

      body = scanRegExpBody();
      flags = scanRegExpFlags();
      value = testRegExp(body.value, flags.value);

      if (extra.tokenize) {
          return {
              type: Token.RegularExpression,
              value: value,
              regex: {
                  pattern: body.value,
                  flags: flags.value
              },
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: start,
              end: index
          };
      }

      return {
          literal: body.literal + flags.literal,
          value: value,
          regex: {
              pattern: body.value,
              flags: flags.value
          },
          start: start,
          end: index
      };
  }

  function collectRegex() {
      var pos, loc, regex, token;

      skipComment();

      pos = index;
      loc = {
          start: {
              line: lineNumber,
              column: index - lineStart
          }
      };

      regex = scanRegExp();

      loc.end = {
          line: lineNumber,
          column: index - lineStart
      };

      if (!extra.tokenize) {
          // Pop the previous token, which is likely '/' or '/='
          if (extra.tokens.length > 0) {
              token = extra.tokens[extra.tokens.length - 1];
              if (token.range[0] === pos && token.type === 'Punctuator') {
                  if (token.value === '/' || token.value === '/=') {
                      extra.tokens.pop();
                  }
              }
          }

          extra.tokens.push({
              type: 'RegularExpression',
              value: regex.literal,
              regex: regex.regex,
              range: [pos, index],
              loc: loc
          });
      }

      return regex;
  }

  function isIdentifierName(token) {
      return token.type === Token.Identifier ||
          token.type === Token.Keyword ||
          token.type === Token.BooleanLiteral ||
          token.type === Token.NullLiteral;
  }

  function advanceSlash() {
      var prevToken,
          checkToken;
      // Using the following algorithm:
      // https://github.com/mozilla/sweet.js/wiki/design
      prevToken = extra.tokens[extra.tokens.length - 1];
      if (!prevToken) {
          // Nothing before that: it cannot be a division.
          return collectRegex();
      }
      if (prevToken.type === 'Punctuator') {
          if (prevToken.value === ']') {
              return scanPunctuator();
          }
          if (prevToken.value === ')') {
              checkToken = extra.tokens[extra.openParenToken - 1];
              if (checkToken &&
                      checkToken.type === 'Keyword' &&
                      (checkToken.value === 'if' ||
                       checkToken.value === 'while' ||
                       checkToken.value === 'for' ||
                       checkToken.value === 'with')) {
                  return collectRegex();
              }
              return scanPunctuator();
          }
          if (prevToken.value === '}') {
              // Dividing a function by anything makes little sense,
              // but we have to check for that.
              if (extra.tokens[extra.openCurlyToken - 3] &&
                      extra.tokens[extra.openCurlyToken - 3].type === 'Keyword') {
                  // Anonymous function.
                  checkToken = extra.tokens[extra.openCurlyToken - 4];
                  if (!checkToken) {
                      return scanPunctuator();
                  }
              } else if (extra.tokens[extra.openCurlyToken - 4] &&
                      extra.tokens[extra.openCurlyToken - 4].type === 'Keyword') {
                  // Named function.
                  checkToken = extra.tokens[extra.openCurlyToken - 5];
                  if (!checkToken) {
                      return collectRegex();
                  }
              } else {
                  return scanPunctuator();
              }
              return scanPunctuator();
          }
          return collectRegex();
      }
      if (prevToken.type === 'Keyword' && prevToken.value !== 'this') {
          return collectRegex();
      }
      return scanPunctuator();
  }

  function advance() {
      var ch;

      skipComment();

      if (index >= length) {
          return {
              type: Token.EOF,
              lineNumber: lineNumber,
              lineStart: lineStart,
              start: index,
              end: index
          };
      }

      ch = source.charCodeAt(index);

      if (isIdentifierStart(ch)) {
          return scanIdentifier();
      }

      // Very common: ( and ) and ;
      if (ch === 0x28 || ch === 0x29 || ch === 0x3B) {
          return scanPunctuator();
      }

      // String literal starts with single quote (U+0027) or double quote (U+0022).
      if (ch === 0x27 || ch === 0x22) {
          return scanStringLiteral();
      }


      // Dot (.) U+002E can also start a floating-point number, hence the need
      // to check the next character.
      if (ch === 0x2E) {
          if (isDecimalDigit(source.charCodeAt(index + 1))) {
              return scanNumericLiteral();
          }
          return scanPunctuator();
      }

      if (isDecimalDigit(ch)) {
          return scanNumericLiteral();
      }

      // Slash (/) U+002F can also start a regex.
      if (extra.tokenize && ch === 0x2F) {
          return advanceSlash();
      }

      return scanPunctuator();
  }

  function collectToken() {
      var loc, token, value, entry;

      skipComment();
      loc = {
          start: {
              line: lineNumber,
              column: index - lineStart
          }
      };

      token = advance();
      loc.end = {
          line: lineNumber,
          column: index - lineStart
      };

      if (token.type !== Token.EOF) {
          value = source.slice(token.start, token.end);
          entry = {
              type: TokenName[token.type],
              value: value,
              range: [token.start, token.end],
              loc: loc
          };
          if (token.regex) {
              entry.regex = {
                  pattern: token.regex.pattern,
                  flags: token.regex.flags
              };
          }
          extra.tokens.push(entry);
      }

      return token;
  }

  function lex() {
      var token;

      token = lookahead;
      index = token.end;
      lineNumber = token.lineNumber;
      lineStart = token.lineStart;

      lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();

      index = token.end;
      lineNumber = token.lineNumber;
      lineStart = token.lineStart;

      return token;
  }

  function peek() {
      var pos, line, start;

      pos = index;
      line = lineNumber;
      start = lineStart;
      lookahead = (typeof extra.tokens !== 'undefined') ? collectToken() : advance();
      index = pos;
      lineNumber = line;
      lineStart = start;
  }

  function Position() {
      this.line = lineNumber;
      this.column = index - lineStart;
  }

  function SourceLocation() {
      this.start = new Position();
      this.end = null;
  }

  function WrappingSourceLocation(startToken) {
      if (startToken.type === Token.StringLiteral) {
          this.start = {
              line: startToken.startLineNumber,
              column: startToken.start - startToken.startLineStart
          };
      } else {
          this.start = {
              line: startToken.lineNumber,
              column: startToken.start - startToken.lineStart
          };
      }
      this.end = null;
  }

  function Node() {
      // Skip comment.
      index = lookahead.start;
      if (lookahead.type === Token.StringLiteral) {
          lineNumber = lookahead.startLineNumber;
          lineStart = lookahead.startLineStart;
      } else {
          lineNumber = lookahead.lineNumber;
          lineStart = lookahead.lineStart;
      }
      if (extra.range) {
          this.range = [index, 0];
      }
      if (extra.loc) {
          this.loc = new SourceLocation();
      }
  }

  function WrappingNode(startToken) {
      if (extra.range) {
          this.range = [startToken.start, 0];
      }
      if (extra.loc) {
          this.loc = new WrappingSourceLocation(startToken);
      }
  }

  WrappingNode.prototype = Node.prototype = {

      finish: function () {
          if (extra.range) {
              this.range[1] = index;
          }
          if (extra.loc) {
              this.loc.end = new Position();
              if (extra.source) {
                  this.loc.source = extra.source;
              }
          }
      },

      finishArrayExpression: function (elements) {
          this.type = Syntax.ArrayExpression;
          this.elements = elements;
          this.finish();
          return this;
      },

      finishAssignmentExpression: function (operator, left, right) {
          this.type = Syntax.AssignmentExpression;
          this.operator = operator;
          this.left = left;
          this.right = right;
          this.finish();
          return this;
      },

      finishBinaryExpression: function (operator, left, right) {
          this.type = (operator === '||' || operator === '&&') ? Syntax.LogicalExpression : Syntax.BinaryExpression;
          this.operator = operator;
          this.left = left;
          this.right = right;
          this.finish();
          return this;
      },

      finishCallExpression: function (callee, args) {
          this.type = Syntax.CallExpression;
          this.callee = callee;
          this.arguments = args;
          this.finish();
          return this;
      },

      finishConditionalExpression: function (test, consequent, alternate) {
          this.type = Syntax.ConditionalExpression;
          this.test = test;
          this.consequent = consequent;
          this.alternate = alternate;
          this.finish();
          return this;
      },

      finishExpressionStatement: function (expression) {
          this.type = Syntax.ExpressionStatement;
          this.expression = expression;
          this.finish();
          return this;
      },

      finishIdentifier: function (name) {
          this.type = Syntax.Identifier;
          this.name = name;
          this.finish();
          return this;
      },

      finishLiteral: function (token) {
          this.type = Syntax.Literal;
          this.value = token.value;
          this.raw = source.slice(token.start, token.end);
          if (token.regex) {
              if (this.raw == '//') {
                this.raw = '/(?:)/';
              }
              this.regex = token.regex;
          }
          this.finish();
          return this;
      },

      finishMemberExpression: function (accessor, object, property) {
          this.type = Syntax.MemberExpression;
          this.computed = accessor === '[';
          this.object = object;
          this.property = property;
          this.finish();
          return this;
      },

      finishObjectExpression: function (properties) {
          this.type = Syntax.ObjectExpression;
          this.properties = properties;
          this.finish();
          return this;
      },

      finishProgram: function (body) {
          this.type = Syntax.Program;
          this.body = body;
          this.finish();
          return this;
      },

      finishProperty: function (kind, key, value) {
          this.type = Syntax.Property;
          this.key = key;
          this.value = value;
          this.kind = kind;
          this.finish();
          return this;
      },

      finishUnaryExpression: function (operator, argument) {
          this.type = Syntax.UnaryExpression;
          this.operator = operator;
          this.argument = argument;
          this.prefix = true;
          this.finish();
          return this;
      }
  };

  // Return true if there is a line terminator before the next token.

  function peekLineTerminator() {
      var pos, line, start, found;

      pos = index;
      line = lineNumber;
      start = lineStart;
      skipComment();
      found = lineNumber !== line;
      index = pos;
      lineNumber = line;
      lineStart = start;

      return found;
  }

  // Throw an exception

  function throwError(token, messageFormat) {
      var error,
          args = Array.prototype.slice.call(arguments, 2),
          msg = messageFormat.replace(
              /%(\d)/g,
              function (whole, index) {
                  assert(index < args.length, 'Message reference must be in range');
                  return args[index];
              }
          );

      if (typeof token.lineNumber === 'number') {
          error = new Error('Line ' + token.lineNumber + ': ' + msg);
          error.index = token.start;
          error.lineNumber = token.lineNumber;
          error.column = token.start - lineStart + 1;
      } else {
          error = new Error('Line ' + lineNumber + ': ' + msg);
          error.index = index;
          error.lineNumber = lineNumber;
          error.column = index - lineStart + 1;
      }

      error.description = msg;
      throw error;
  }

  function throwErrorTolerant() {
      try {
          throwError.apply(null, arguments);
      } catch (e) {
          if (extra.errors) {
              extra.errors.push(e);
          } else {
              throw e;
          }
      }
  }


  // Throw an exception because of the token.

  function throwUnexpected(token) {
      if (token.type === Token.EOF) {
          throwError(token, Messages.UnexpectedEOS);
      }

      if (token.type === Token.NumericLiteral) {
          throwError(token, Messages.UnexpectedNumber);
      }

      if (token.type === Token.StringLiteral) {
          throwError(token, Messages.UnexpectedString);
      }

      if (token.type === Token.Identifier) {
          throwError(token, Messages.UnexpectedIdentifier);
      }

      if (token.type === Token.Keyword) {
          if (isFutureReservedWord(token.value)) {
              throwError(token, Messages.UnexpectedReserved);
          } else if (strict && isStrictModeReservedWord(token.value)) {
              throwErrorTolerant(token, Messages.StrictReservedWord);
              return;
          }
          throwError(token, Messages.UnexpectedToken, token.value);
      }

      // BooleanLiteral, NullLiteral, or Punctuator.
      throwError(token, Messages.UnexpectedToken, token.value);
  }

  // Expect the next token to match the specified punctuator.
  // If not, an exception will be thrown.

  function expect(value) {
      var token = lex();
      if (token.type !== Token.Punctuator || token.value !== value) {
          throwUnexpected(token);
      }
  }

  /**
   * @name expectTolerant
   * @description Quietly expect the given token value when in tolerant mode, otherwise delegates
   * to <code>expect(value)</code>
   * @param {String} value The value we are expecting the lookahead token to have
   * @since 2.0
   */
  function expectTolerant(value) {
      if (extra.errors) {
          var token = lookahead;
          if (token.type !== Token.Punctuator && token.value !== value) {
              throwErrorTolerant(token, Messages.UnexpectedToken, token.value);
          } else {
              lex();
          }
      } else {
          expect(value);
      }
  }

  // Return true if the next token matches the specified punctuator.

  function match(value) {
      return lookahead.type === Token.Punctuator && lookahead.value === value;
  }

  // Return true if the next token matches the specified keyword

  function matchKeyword(keyword) {
      return lookahead.type === Token.Keyword && lookahead.value === keyword;
  }

  function consumeSemicolon() {
      var line;

      // Catch the very common case first: immediately a semicolon (U+003B).
      if (source.charCodeAt(index) === 0x3B || match(';')) {
          lex();
          return;
      }

      line = lineNumber;
      skipComment();
      if (lineNumber !== line) {
          return;
      }

      if (lookahead.type !== Token.EOF && !match('}')) {
          throwUnexpected(lookahead);
      }
  }

  // 11.1.4 Array Initialiser

  function parseArrayInitialiser() {
      var elements = [], node = new Node();

      expect('[');

      while (!match(']')) {
          if (match(',')) {
              lex();
              elements.push(null);
          } else {
              elements.push(parseAssignmentExpression());

              if (!match(']')) {
                  expect(',');
              }
          }
      }

      lex();

      return node.finishArrayExpression(elements);
  }

  // 11.1.5 Object Initialiser

  function parseObjectPropertyKey() {
      var token, node = new Node();

      token = lex();

      // Note: This function is called only from parseObjectProperty(), where
      // EOF and Punctuator tokens are already filtered out.

      if (token.type === Token.StringLiteral || token.type === Token.NumericLiteral) {
          if (strict && token.octal) {
              throwErrorTolerant(token, Messages.StrictOctalLiteral);
          }
          return node.finishLiteral(token);
      }

      return node.finishIdentifier(token.value);
  }

  function parseObjectProperty() {
      var token, key, id, value, node = new Node();

      token = lookahead;

      if (token.type === Token.Identifier) {
          id = parseObjectPropertyKey();
          expect(':');
          value = parseAssignmentExpression();
          return node.finishProperty('init', id, value);
      }
      if (token.type === Token.EOF || token.type === Token.Punctuator) {
          throwUnexpected(token);
      } else {
          key = parseObjectPropertyKey();
          expect(':');
          value = parseAssignmentExpression();
          return node.finishProperty('init', key, value);
      }
  }

  function parseObjectInitialiser() {
      var properties = [], property, name, key, kind, map = {}, toString = String, node = new Node();

      expect('{');

      while (!match('}')) {
          property = parseObjectProperty();

          if (property.key.type === Syntax.Identifier) {
              name = property.key.name;
          } else {
              name = toString(property.key.value);
          }
          kind = (property.kind === 'init') ? PropertyKind.Data : (property.kind === 'get') ? PropertyKind.Get : PropertyKind.Set;

          key = '$' + name;
          if (Object.prototype.hasOwnProperty.call(map, key)) {
              if (map[key] === PropertyKind.Data) {
                  if (strict && kind === PropertyKind.Data) {
                      throwErrorTolerant({}, Messages.StrictDuplicateProperty);
                  } else if (kind !== PropertyKind.Data) {
                      throwErrorTolerant({}, Messages.AccessorDataProperty);
                  }
              } else {
                  if (kind === PropertyKind.Data) {
                      throwErrorTolerant({}, Messages.AccessorDataProperty);
                  } else if (map[key] & kind) {
                      throwErrorTolerant({}, Messages.AccessorGetSet);
                  }
              }
              map[key] |= kind;
          } else {
              map[key] = kind;
          }

          properties.push(property);

          if (!match('}')) {
              expectTolerant(',');
          }
      }

      expect('}');

      return node.finishObjectExpression(properties);
  }

  // 11.1.6 The Grouping Operator

  function parseGroupExpression() {
      var expr;

      expect('(');

      ++state.parenthesisCount;

      expr = parseExpression();

      expect(')');

      return expr;
  }


  // 11.1 Primary Expressions

  var legalKeywords = {"if":1, "this":1};

  function parsePrimaryExpression() {
      var type, token, expr, node;

      if (match('(')) {
          return parseGroupExpression();
      }

      if (match('[')) {
          return parseArrayInitialiser();
      }

      if (match('{')) {
          return parseObjectInitialiser();
      }

      type = lookahead.type;
      node = new Node();

      if (type === Token.Identifier || legalKeywords[lookahead.value]) {
          expr = node.finishIdentifier(lex().value);
      } else if (type === Token.StringLiteral || type === Token.NumericLiteral) {
          if (strict && lookahead.octal) {
              throwErrorTolerant(lookahead, Messages.StrictOctalLiteral);
          }
          expr = node.finishLiteral(lex());
      } else if (type === Token.Keyword) {
          throw new Error("Disabled.");
      } else if (type === Token.BooleanLiteral) {
          token = lex();
          token.value = (token.value === 'true');
          expr = node.finishLiteral(token);
      } else if (type === Token.NullLiteral) {
          token = lex();
          token.value = null;
          expr = node.finishLiteral(token);
      } else if (match('/') || match('/=')) {
          if (typeof extra.tokens !== 'undefined') {
              expr = node.finishLiteral(collectRegex());
          } else {
              expr = node.finishLiteral(scanRegExp());
          }
          peek();
      } else {
          throwUnexpected(lex());
      }

      return expr;
  }

  // 11.2 Left-Hand-Side Expressions

  function parseArguments() {
      var args = [];

      expect('(');

      if (!match(')')) {
          while (index < length) {
              args.push(parseAssignmentExpression());
              if (match(')')) {
                  break;
              }
              expectTolerant(',');
          }
      }

      expect(')');

      return args;
  }

  function parseNonComputedProperty() {
      var token, node = new Node();

      token = lex();

      if (!isIdentifierName(token)) {
          throwUnexpected(token);
      }

      return node.finishIdentifier(token.value);
  }

  function parseNonComputedMember() {
      expect('.');

      return parseNonComputedProperty();
  }

  function parseComputedMember() {
      var expr;

      expect('[');

      expr = parseExpression();

      expect(']');

      return expr;
  }

  function parseLeftHandSideExpressionAllowCall() {
      var expr, args, property, startToken, previousAllowIn = state.allowIn;

      startToken = lookahead;
      state.allowIn = true;
      expr = parsePrimaryExpression();

      for (;;) {
          if (match('.')) {
              property = parseNonComputedMember();
              expr = new WrappingNode(startToken).finishMemberExpression('.', expr, property);
          } else if (match('(')) {
              args = parseArguments();
              expr = new WrappingNode(startToken).finishCallExpression(expr, args);
          } else if (match('[')) {
              property = parseComputedMember();
              expr = new WrappingNode(startToken).finishMemberExpression('[', expr, property);
          } else {
              break;
          }
      }
      state.allowIn = previousAllowIn;

      return expr;
  }

  // 11.3 Postfix Expressions

  function parsePostfixExpression() {
      var expr = parseLeftHandSideExpressionAllowCall();

      if (lookahead.type === Token.Punctuator) {
          if ((match('++') || match('--')) && !peekLineTerminator()) {
              throw new Error("Disabled.");
          }
      }

      return expr;
  }

  // 11.4 Unary Operators

  function parseUnaryExpression() {
      var token, expr, startToken;

      if (lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword) {
          expr = parsePostfixExpression();
      } else if (match('++') || match('--')) {
          throw new Error("Disabled.");
      } else if (match('+') || match('-') || match('~') || match('!')) {
          startToken = lookahead;
          token = lex();
          expr = parseUnaryExpression();
          expr = new WrappingNode(startToken).finishUnaryExpression(token.value, expr);
      } else if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
          throw new Error("Disabled.");
      } else {
          expr = parsePostfixExpression();
      }

      return expr;
  }

  function binaryPrecedence(token, allowIn) {
      var prec = 0;

      if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
          return 0;
      }

      switch (token.value) {
      case '||':
          prec = 1;
          break;

      case '&&':
          prec = 2;
          break;

      case '|':
          prec = 3;
          break;

      case '^':
          prec = 4;
          break;

      case '&':
          prec = 5;
          break;

      case '==':
      case '!=':
      case '===':
      case '!==':
          prec = 6;
          break;

      case '<':
      case '>':
      case '<=':
      case '>=':
      case 'instanceof':
          prec = 7;
          break;

      case 'in':
          prec = allowIn ? 7 : 0;
          break;

      case '<<':
      case '>>':
      case '>>>':
          prec = 8;
          break;

      case '+':
      case '-':
          prec = 9;
          break;

      case '*':
      case '/':
      case '%':
          prec = 11;
          break;

      default:
          break;
      }

      return prec;
  }

  // 11.5 Multiplicative Operators
  // 11.6 Additive Operators
  // 11.7 Bitwise Shift Operators
  // 11.8 Relational Operators
  // 11.9 Equality Operators
  // 11.10 Binary Bitwise Operators
  // 11.11 Binary Logical Operators

  function parseBinaryExpression() {
      var marker, markers, expr, token, prec, stack, right, operator, left, i;

      marker = lookahead;
      left = parseUnaryExpression();

      token = lookahead;
      prec = binaryPrecedence(token, state.allowIn);
      if (prec === 0) {
          return left;
      }
      token.prec = prec;
      lex();

      markers = [marker, lookahead];
      right = parseUnaryExpression();

      stack = [left, token, right];

      while ((prec = binaryPrecedence(lookahead, state.allowIn)) > 0) {

          // Reduce: make a binary expression from the three topmost entries.
          while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
              right = stack.pop();
              operator = stack.pop().value;
              left = stack.pop();
              markers.pop();
              expr = new WrappingNode(markers[markers.length - 1]).finishBinaryExpression(operator, left, right);
              stack.push(expr);
          }

          // Shift.
          token = lex();
          token.prec = prec;
          stack.push(token);
          markers.push(lookahead);
          expr = parseUnaryExpression();
          stack.push(expr);
      }

      // Final reduce to clean-up the stack.
      i = stack.length - 1;
      expr = stack[i];
      markers.pop();
      while (i > 1) {
          expr = new WrappingNode(markers.pop()).finishBinaryExpression(stack[i - 1].value, stack[i - 2], expr);
          i -= 2;
      }

      return expr;
  }

  // 11.12 Conditional Operator

  function parseConditionalExpression() {
      var expr, previousAllowIn, consequent, alternate, startToken;

      startToken = lookahead;

      expr = parseBinaryExpression();

      if (match('?')) {
          lex();
          previousAllowIn = state.allowIn;
          state.allowIn = true;
          consequent = parseAssignmentExpression();
          state.allowIn = previousAllowIn;
          expect(':');
          alternate = parseAssignmentExpression();

          expr = new WrappingNode(startToken).finishConditionalExpression(expr, consequent, alternate);
      }

      return expr;
  }

  // 11.13 Assignment Operators

  function parseAssignmentExpression() {
      var oldParenthesisCount, token, expr, startToken;

      oldParenthesisCount = state.parenthesisCount;

      startToken = lookahead;
      token = lookahead;

      expr = parseConditionalExpression();

      return expr;
  }

  // 11.14 Comma Operator

  function parseExpression() {
      var expr = parseAssignmentExpression();

      if (match(',')) {
          throw new Error("Disabled."); // no sequence expressions
      }

      return expr;
  }

  // 12.4 Expression Statement

  function parseExpressionStatement(node) {
      var expr = parseExpression();
      consumeSemicolon();
      return node.finishExpressionStatement(expr);
  }

  // 12 Statements

  function parseStatement() {
      var type = lookahead.type,
          expr,
          node;

      if (type === Token.EOF) {
          throwUnexpected(lookahead);
      }

      if (type === Token.Punctuator && lookahead.value === '{') {
          throw new Error("Disabled."); // block statement
      }

      node = new Node();

      if (type === Token.Punctuator) {
          switch (lookahead.value) {
          case ';':
              throw new Error("Disabled."); // empty statement
          case '(':
              return parseExpressionStatement(node);
          default:
              break;
          }
      } else if (type === Token.Keyword) {
          throw new Error("Disabled."); // keyword
      }

      expr = parseExpression();
      consumeSemicolon();
      return node.finishExpressionStatement(expr);
  }

  // 14 Program

  function parseSourceElement() {
      if (lookahead.type === Token.Keyword) {
          switch (lookahead.value) {
          case 'const':
          case 'let':
              throw new Error("Disabled.");
          case 'function':
              throw new Error("Disabled.");
          default:
              return parseStatement();
          }
      }

      if (lookahead.type !== Token.EOF) {
          return parseStatement();
      }
  }

  function parseSourceElements() {
      var sourceElement, sourceElements = [], token, directive, firstRestricted;

      while (index < length) {
          token = lookahead;
          if (token.type !== Token.StringLiteral) {
              break;
          }

          sourceElement = parseSourceElement();
          sourceElements.push(sourceElement);
          if (sourceElement.expression.type !== Syntax.Literal) {
              // this is not directive
              break;
          }
          directive = source.slice(token.start + 1, token.end - 1);
          if (directive === 'use strict') {
              strict = true;
              if (firstRestricted) {
                  throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
              }
          } else {
              if (!firstRestricted && token.octal) {
                  firstRestricted = token;
              }
          }
      }

      while (index < length) {
          sourceElement = parseSourceElement();
          if (typeof sourceElement === 'undefined') {
              break;
          }
          sourceElements.push(sourceElement);
      }
      return sourceElements;
  }

  function parseProgram() {
      var body, node;

      skipComment();
      peek();
      node = new Node();
      strict = true; // assume strict

      body = parseSourceElements();
      return node.finishProgram(body);
  }

  function filterTokenLocation() {
      var i, entry, token, tokens = [];

      for (i = 0; i < extra.tokens.length; ++i) {
          entry = extra.tokens[i];
          token = {
              type: entry.type,
              value: entry.value
          };
          if (entry.regex) {
              token.regex = {
                  pattern: entry.regex.pattern,
                  flags: entry.regex.flags
              };
          }
          if (extra.range) {
              token.range = entry.range;
          }
          if (extra.loc) {
              token.loc = entry.loc;
          }
          tokens.push(token);
      }

      extra.tokens = tokens;
  }

  function tokenize(code, options) {
      var toString,
          tokens;

      toString = String;
      if (typeof code !== 'string' && !(code instanceof String)) {
          code = toString(code);
      }

      source = code;
      index = 0;
      lineNumber = (source.length > 0) ? 1 : 0;
      lineStart = 0;
      length = source.length;
      lookahead = null;
      state = {
          allowIn: true,
          labelSet: {},
          inFunctionBody: false,
          inIteration: false,
          inSwitch: false,
          lastCommentStart: -1
      };

      extra = {};

      // Options matching.
      options = options || {};

      // Of course we collect tokens here.
      options.tokens = true;
      extra.tokens = [];
      extra.tokenize = true;
      // The following two fields are necessary to compute the Regex tokens.
      extra.openParenToken = -1;
      extra.openCurlyToken = -1;

      extra.range = (typeof options.range === 'boolean') && options.range;
      extra.loc = (typeof options.loc === 'boolean') && options.loc;

      if (typeof options.tolerant === 'boolean' && options.tolerant) {
          extra.errors = [];
      }

      try {
          peek();
          if (lookahead.type === Token.EOF) {
              return extra.tokens;
          }

          lex();
          while (lookahead.type !== Token.EOF) {
              try {
                  lex();
              } catch (lexError) {
                  if (extra.errors) {
                      extra.errors.push(lexError);
                      // We have to break on the first error
                      // to avoid infinite loops.
                      break;
                  } else {
                      throw lexError;
                  }
              }
          }

          filterTokenLocation();
          tokens = extra.tokens;
          if (typeof extra.errors !== 'undefined') {
              tokens.errors = extra.errors;
          }
      } catch (e) {
          throw e;
      } finally {
          extra = {};
      }
      return tokens;
  }

  function parse(code, options) {
      var program, toString;

      toString = String;
      if (typeof code !== 'string' && !(code instanceof String)) {
          code = toString(code);
      }

      source = code;
      index = 0;
      lineNumber = (source.length > 0) ? 1 : 0;
      lineStart = 0;
      length = source.length;
      lookahead = null;
      state = {
          allowIn: true,
          labelSet: {},
          parenthesisCount: 0,
          inFunctionBody: false,
          inIteration: false,
          inSwitch: false,
          lastCommentStart: -1
      };

      extra = {};
      if (typeof options !== 'undefined') {
          extra.range = (typeof options.range === 'boolean') && options.range;
          extra.loc = (typeof options.loc === 'boolean') && options.loc;

          if (extra.loc && options.source !== null && options.source !== undefined) {
              extra.source = toString(options.source);
          }

          if (typeof options.tokens === 'boolean' && options.tokens) {
              extra.tokens = [];
          }
          if (typeof options.tolerant === 'boolean' && options.tolerant) {
              extra.errors = [];
          }
      }

      try {
          program = parseProgram();
          if (typeof extra.tokens !== 'undefined') {
              filterTokenLocation();
              program.tokens = extra.tokens;
          }
          if (typeof extra.errors !== 'undefined') {
              program.errors = extra.errors;
          }
      } catch (e) {
          throw e;
      } finally {
          extra = {};
      }

      return program;
  }

  return {
    tokenize: tokenize,
    parse: parse
  };

})();

/***/ }),

/***/ "HES2":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var common_1 = __webpack_require__("MtYt");
var line;
(function (line) {
    function markType() {
        return 'line';
    }
    line.markType = markType;
    function properties(model) {
        var p = {};
        var config = model.config();
        p.x = x(model.encoding().x, model.scaleName(channel_1.X), config);
        p.y = y(model.encoding().y, model.scaleName(channel_1.Y), config);
        var _size = size(model.encoding().size, config);
        if (_size) {
            p.strokeWidth = _size;
        }
        common_1.applyColorAndOpacity(p, model);
        common_1.applyMarkConfig(p, model, ['interpolate', 'tension']);
        return p;
    }
    line.properties = properties;
    function x(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
        }
        return { value: 0 };
    }
    function y(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
        }
        return { field: { group: 'height' } };
    }
    function size(fieldDef, config) {
        if (fieldDef && fieldDef.value !== undefined) {
            return { value: fieldDef.value };
        }
        return { value: config.mark.lineSize };
    }
    function labels(model) {
        return undefined;
    }
    line.labels = labels;
})(line = exports.line || (exports.line = {}));
//# sourceMappingURL=line.js.map

/***/ }),

/***/ "HaGw":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/");

function draw(g, scene, bounds) {
  if (!scene.items || !scene.items.length) return;

  var items = scene.items,
      o, opac, x, y, w, h;

  for (var i=0, len=items.length; i<len; ++i) {
    o = items[i];
    if (bounds && !bounds.intersects(o.bounds))
      continue; // bounds check

    opac = o.opacity == null ? 1 : o.opacity;
    if (opac === 0) continue;

    x = o.x || 0;
    y = o.y || 0;
    w = o.width || 0;
    h = o.height || 0;

    if (o.fill && util.fill(g, o, opac)) {
      g.fillRect(x, y, w, h);
    }
    if (o.stroke && util.stroke(g, o, opac)) {
      g.strokeRect(x, y, w, h);
    }
  }
}

module.exports = {
  draw: draw,
  pick: util.pick()
};

/***/ }),

/***/ "HeGT":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var axis_1 = __webpack_require__("cihr");
var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var common_1 = __webpack_require__("MtYt");
function parseAxisComponent(model, axisChannels) {
    return axisChannels.reduce(function (axis, channel) {
        if (model.axis(channel)) {
            axis[channel] = parseAxis(channel, model);
        }
        return axis;
    }, {});
}
exports.parseAxisComponent = parseAxisComponent;
function parseInnerAxis(channel, model) {
    var isCol = channel === channel_1.COLUMN, isRow = channel === channel_1.ROW, type = isCol ? 'x' : isRow ? 'y' : channel;
    var def = {
        type: type,
        scale: model.scaleName(channel),
        grid: true,
        tickSize: 0,
        properties: {
            labels: {
                text: { value: '' }
            },
            axis: {
                stroke: { value: 'transparent' }
            }
        }
    };
    var axis = model.axis(channel);
    ['layer', 'ticks', 'values', 'subdivide'].forEach(function (property) {
        var method;
        var value = (method = exports[property]) ?
            method(model, channel, def) :
            axis[property];
        if (value !== undefined) {
            def[property] = value;
        }
    });
    var props = model.axis(channel).properties || {};
    ['grid'].forEach(function (group) {
        var value = properties[group] ?
            properties[group](model, channel, props[group] || {}, def) :
            props[group];
        if (value !== undefined && util_1.keys(value).length > 0) {
            def.properties = def.properties || {};
            def.properties[group] = value;
        }
    });
    return def;
}
exports.parseInnerAxis = parseInnerAxis;
function parseAxis(channel, model) {
    var isCol = channel === channel_1.COLUMN, isRow = channel === channel_1.ROW, type = isCol ? 'x' : isRow ? 'y' : channel;
    var axis = model.axis(channel);
    var def = {
        type: type,
        scale: model.scaleName(channel)
    };
    [
        'format', 'grid', 'layer', 'offset', 'orient', 'tickSize', 'ticks', 'tickSizeEnd', 'title', 'titleOffset',
        'tickPadding', 'tickSize', 'tickSizeMajor', 'tickSizeMinor', 'values', 'subdivide'
    ].forEach(function (property) {
        var method;
        var value = (method = exports[property]) ?
            method(model, channel, def) :
            axis[property];
        if (value !== undefined) {
            def[property] = value;
        }
    });
    var props = model.axis(channel).properties || {};
    [
        'axis', 'labels',
        'grid', 'title', 'ticks', 'majorTicks', 'minorTicks'
    ].forEach(function (group) {
        var value = properties[group] ?
            properties[group](model, channel, props[group] || {}, def) :
            props[group];
        if (value !== undefined && util_1.keys(value).length > 0) {
            def.properties = def.properties || {};
            def.properties[group] = value;
        }
    });
    return def;
}
exports.parseAxis = parseAxis;
function format(model, channel) {
    return common_1.numberFormat(model.fieldDef(channel), model.axis(channel).format, model.config());
}
exports.format = format;
function offset(model, channel) {
    return model.axis(channel).offset;
}
exports.offset = offset;
function gridShow(model, channel) {
    var grid = model.axis(channel).grid;
    if (grid !== undefined) {
        return grid;
    }
    return !model.isOrdinalScale(channel) && !model.fieldDef(channel).bin;
}
exports.gridShow = gridShow;
function grid(model, channel) {
    if (channel === channel_1.ROW || channel === channel_1.COLUMN) {
        return undefined;
    }
    return gridShow(model, channel) && ((channel === channel_1.Y || channel === channel_1.X) && !(model.parent() && model.parent().isFacet()));
}
exports.grid = grid;
function layer(model, channel, def) {
    var layer = model.axis(channel).layer;
    if (layer !== undefined) {
        return layer;
    }
    if (def.grid) {
        return 'back';
    }
    return undefined;
}
exports.layer = layer;
;
function orient(model, channel) {
    var orient = model.axis(channel).orient;
    if (orient) {
        return orient;
    }
    else if (channel === channel_1.COLUMN) {
        return axis_1.AxisOrient.TOP;
    }
    return undefined;
}
exports.orient = orient;
function ticks(model, channel) {
    var ticks = model.axis(channel).ticks;
    if (ticks !== undefined) {
        return ticks;
    }
    if (channel === channel_1.X && !model.fieldDef(channel).bin) {
        return 5;
    }
    return undefined;
}
exports.ticks = ticks;
function tickSize(model, channel) {
    var tickSize = model.axis(channel).tickSize;
    if (tickSize !== undefined) {
        return tickSize;
    }
    return undefined;
}
exports.tickSize = tickSize;
function tickSizeEnd(model, channel) {
    var tickSizeEnd = model.axis(channel).tickSizeEnd;
    if (tickSizeEnd !== undefined) {
        return tickSizeEnd;
    }
    return undefined;
}
exports.tickSizeEnd = tickSizeEnd;
function title(model, channel) {
    var axis = model.axis(channel);
    if (axis.title !== undefined) {
        return axis.title;
    }
    var fieldTitle = fielddef_1.title(model.fieldDef(channel), model.config());
    var maxLength;
    if (axis.titleMaxLength) {
        maxLength = axis.titleMaxLength;
    }
    else if (channel === channel_1.X && !model.isOrdinalScale(channel_1.X)) {
        var unitModel = model;
        maxLength = unitModel.config().cell.width / model.axis(channel_1.X).characterWidth;
    }
    else if (channel === channel_1.Y && !model.isOrdinalScale(channel_1.Y)) {
        var unitModel = model;
        maxLength = unitModel.config().cell.height / model.axis(channel_1.Y).characterWidth;
    }
    return maxLength ? util_1.truncate(fieldTitle, maxLength) : fieldTitle;
}
exports.title = title;
function titleOffset(model, channel) {
    var titleOffset = model.axis(channel).titleOffset;
    if (titleOffset !== undefined) {
        return titleOffset;
    }
    return undefined;
}
exports.titleOffset = titleOffset;
var properties;
(function (properties) {
    function axis(model, channel, axisPropsSpec) {
        var axis = model.axis(channel);
        return util_1.extend(axis.axisColor !== undefined ?
            { stroke: { value: axis.axisColor } } :
            {}, axis.axisWidth !== undefined ?
            { strokeWidth: { value: axis.axisWidth } } :
            {}, axisPropsSpec || {});
    }
    properties.axis = axis;
    function grid(model, channel, gridPropsSpec) {
        var axis = model.axis(channel);
        return util_1.extend(axis.gridColor !== undefined ? { stroke: { value: axis.gridColor } } : {}, axis.gridOpacity !== undefined ? { strokeOpacity: { value: axis.gridOpacity } } : {}, axis.gridWidth !== undefined ? { strokeWidth: { value: axis.gridWidth } } : {}, axis.gridDash !== undefined ? { strokeDashOffset: { value: axis.gridDash } } : {}, gridPropsSpec || {});
    }
    properties.grid = grid;
    function labels(model, channel, labelsSpec, def) {
        var fieldDef = model.fieldDef(channel);
        var axis = model.axis(channel);
        var config = model.config();
        if (!axis.labels) {
            return util_1.extend({
                text: ''
            }, labelsSpec);
        }
        if (util_1.contains([type_1.NOMINAL, type_1.ORDINAL], fieldDef.type) && axis.labelMaxLength) {
            labelsSpec = util_1.extend({
                text: {
                    template: '{{ datum.data | truncate:' + axis.labelMaxLength + ' }}'
                }
            }, labelsSpec || {});
        }
        else if (fieldDef.type === type_1.TEMPORAL) {
            labelsSpec = util_1.extend({
                text: {
                    template: common_1.timeTemplate('datum.data', fieldDef.timeUnit, axis.format, axis.shortTimeLabels, config)
                }
            }, labelsSpec);
        }
        if (axis.labelAngle !== undefined) {
            labelsSpec.angle = { value: axis.labelAngle };
        }
        else {
            if (channel === channel_1.X && (fielddef_1.isDimension(fieldDef) || fieldDef.type === type_1.TEMPORAL)) {
                labelsSpec.angle = { value: 270 };
            }
        }
        if (axis.labelAlign !== undefined) {
            labelsSpec.align = { value: axis.labelAlign };
        }
        else {
            if (labelsSpec.angle) {
                if (labelsSpec.angle.value === 270) {
                    labelsSpec.align = {
                        value: def.orient === 'top' ? 'left' :
                            def.type === 'x' ? 'right' :
                                'center'
                    };
                }
                else if (labelsSpec.angle.value === 90) {
                    labelsSpec.align = { value: 'center' };
                }
            }
        }
        if (axis.labelBaseline !== undefined) {
            labelsSpec.baseline = { value: axis.labelBaseline };
        }
        else {
            if (labelsSpec.angle) {
                if (labelsSpec.angle.value === 270) {
                    labelsSpec.baseline = { value: def.type === 'x' ? 'middle' : 'bottom' };
                }
                else if (labelsSpec.angle.value === 90) {
                    labelsSpec.baseline = { value: 'bottom' };
                }
            }
        }
        if (axis.tickLabelColor !== undefined) {
            labelsSpec.stroke = { value: axis.tickLabelColor };
        }
        if (axis.tickLabelFont !== undefined) {
            labelsSpec.font = { value: axis.tickLabelFont };
        }
        if (axis.tickLabelFontSize !== undefined) {
            labelsSpec.fontSize = { value: axis.tickLabelFontSize };
        }
        return util_1.keys(labelsSpec).length === 0 ? undefined : labelsSpec;
    }
    properties.labels = labels;
    function ticks(model, channel, ticksPropsSpec) {
        var axis = model.axis(channel);
        return util_1.extend(axis.tickColor !== undefined ? { stroke: { value: axis.tickColor } } : {}, axis.tickWidth !== undefined ? { strokeWidth: { value: axis.tickWidth } } : {}, ticksPropsSpec || {});
    }
    properties.ticks = ticks;
    function title(model, channel, titlePropsSpec) {
        var axis = model.axis(channel);
        return util_1.extend(axis.titleColor !== undefined ? { stroke: { value: axis.titleColor } } : {}, axis.titleFont !== undefined ? { font: { value: axis.titleFont } } : {}, axis.titleFontSize !== undefined ? { fontSize: { value: axis.titleFontSize } } : {}, axis.titleFontWeight !== undefined ? { fontWeight: { value: axis.titleFontWeight } } : {}, titlePropsSpec || {});
    }
    properties.title = title;
})(properties = exports.properties || (exports.properties = {}));
//# sourceMappingURL=axis.js.map

/***/ }),

/***/ "Hqva":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  ChangeSet:    __webpack_require__("ekYZ"),
  Collector:    __webpack_require__("B1p+"),
  DataSource:   __webpack_require__("xZ2+"),
  Dependencies: __webpack_require__("D3vM"),
  Graph:        __webpack_require__("ARV7"),
  Node:         __webpack_require__("3FFs"),
  Signal:       __webpack_require__("KMnl"),
  Tuple:        __webpack_require__("gtuQ"),
  debug:        __webpack_require__("J731").debug
};


/***/ }),

/***/ "ISRz":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var axis_1 = __webpack_require__("cihr");
var channel_1 = __webpack_require__("P/aK");
var config_1 = __webpack_require__("Py5Z");
var data_1 = __webpack_require__("x6Fv");
var encoding_1 = __webpack_require__("QSMf");
var fielddef_1 = __webpack_require__("o+e1");
var scale_1 = __webpack_require__("Fw/k");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var axis_2 = __webpack_require__("HeGT");
var common_1 = __webpack_require__("MtYt");
var data_2 = __webpack_require__("V22v");
var layout_1 = __webpack_require__("YBv9");
var model_1 = __webpack_require__("jGoH");
var scale_2 = __webpack_require__("TLMq");
var FacetModel = (function (_super) {
    __extends(FacetModel, _super);
    function FacetModel(spec, parent, parentGivenName) {
        _super.call(this, spec, parent, parentGivenName);
        var config = this._config = this._initConfig(spec.config, parent);
        var child = this._child = common_1.buildModel(spec.spec, this, this.name('child'));
        var facet = this._facet = this._initFacet(spec.facet);
        this._scale = this._initScale(facet, config, child);
        this._axis = this._initAxis(facet, config, child);
    }
    FacetModel.prototype._initConfig = function (specConfig, parent) {
        return util_1.mergeDeep(util_1.duplicate(config_1.defaultConfig), specConfig, parent ? parent.config() : {});
    };
    FacetModel.prototype._initFacet = function (facet) {
        facet = util_1.duplicate(facet);
        var model = this;
        encoding_1.channelMappingForEach(this.channels(), facet, function (fieldDef, channel) {
            if (!fielddef_1.isDimension(fieldDef)) {
                model.addWarning(channel + ' encoding should be ordinal.');
            }
            if (fieldDef.type) {
                fieldDef.type = type_1.getFullName(fieldDef.type);
            }
        });
        return facet;
    };
    FacetModel.prototype._initScale = function (facet, config, child) {
        return [channel_1.ROW, channel_1.COLUMN].reduce(function (_scale, channel) {
            if (facet[channel]) {
                var scaleSpec = facet[channel].scale || {};
                _scale[channel] = util_1.extend({
                    type: scale_1.ScaleType.ORDINAL,
                    round: config.facet.scale.round,
                    padding: (channel === channel_1.ROW && child.has(channel_1.Y)) || (channel === channel_1.COLUMN && child.has(channel_1.X)) ?
                        config.facet.scale.padding : 0
                }, scaleSpec);
            }
            return _scale;
        }, {});
    };
    FacetModel.prototype._initAxis = function (facet, config, child) {
        return [channel_1.ROW, channel_1.COLUMN].reduce(function (_axis, channel) {
            if (facet[channel]) {
                var axisSpec = facet[channel].axis;
                if (axisSpec !== false) {
                    var modelAxis = _axis[channel] = util_1.extend({}, config.facet.axis, axisSpec === true ? {} : axisSpec || {});
                    if (channel === channel_1.ROW) {
                        var yAxis = child.axis(channel_1.Y);
                        if (yAxis && yAxis.orient !== axis_1.AxisOrient.RIGHT && !modelAxis.orient) {
                            modelAxis.orient = axis_1.AxisOrient.RIGHT;
                        }
                        if (child.has(channel_1.X) && !modelAxis.labelAngle) {
                            modelAxis.labelAngle = modelAxis.orient === axis_1.AxisOrient.RIGHT ? 90 : 270;
                        }
                    }
                }
            }
            return _axis;
        }, {});
    };
    FacetModel.prototype.facet = function () {
        return this._facet;
    };
    FacetModel.prototype.has = function (channel) {
        return !!this._facet[channel];
    };
    FacetModel.prototype.child = function () {
        return this._child;
    };
    FacetModel.prototype.hasSummary = function () {
        var summary = this.component.data.summary;
        for (var i = 0; i < summary.length; i++) {
            if (util_1.keys(summary[i].measures).length > 0) {
                return true;
            }
        }
        return false;
    };
    FacetModel.prototype.dataTable = function () {
        return (this.hasSummary() ? data_1.SUMMARY : data_1.SOURCE) + '';
    };
    FacetModel.prototype.fieldDef = function (channel) {
        return this.facet()[channel];
    };
    FacetModel.prototype.stack = function () {
        return null;
    };
    FacetModel.prototype.parseData = function () {
        this.child().parseData();
        this.component.data = data_2.parseFacetData(this);
    };
    FacetModel.prototype.parseSelectionData = function () {
    };
    FacetModel.prototype.parseLayoutData = function () {
        this.child().parseLayoutData();
        this.component.layout = layout_1.parseFacetLayout(this);
    };
    FacetModel.prototype.parseScale = function () {
        var child = this.child();
        var model = this;
        child.parseScale();
        var scaleComponent = this.component.scale = scale_2.parseScaleComponent(this);
        util_1.keys(child.component.scale).forEach(function (channel) {
            if (true) {
                scaleComponent[channel] = child.component.scale[channel];
                util_1.vals(scaleComponent[channel]).forEach(function (scale) {
                    var scaleNameWithoutPrefix = scale.name.substr(child.name('').length);
                    var newName = model.scaleName(scaleNameWithoutPrefix);
                    child.renameScale(scale.name, newName);
                    scale.name = newName;
                });
                delete child.component.scale[channel];
            }
        });
    };
    FacetModel.prototype.parseMark = function () {
        this.child().parseMark();
        this.component.mark = util_1.extend({
            name: this.name('cell'),
            type: 'group',
            from: util_1.extend(this.dataTable() ? { data: this.dataTable() } : {}, {
                transform: [{
                        type: 'facet',
                        groupby: [].concat(this.has(channel_1.ROW) ? [this.field(channel_1.ROW)] : [], this.has(channel_1.COLUMN) ? [this.field(channel_1.COLUMN)] : [])
                    }]
            }),
            properties: {
                update: getFacetGroupProperties(this)
            }
        }, this.child().assembleGroup());
    };
    FacetModel.prototype.parseAxis = function () {
        this.child().parseAxis();
        this.component.axis = axis_2.parseAxisComponent(this, [channel_1.ROW, channel_1.COLUMN]);
    };
    FacetModel.prototype.parseAxisGroup = function () {
        var xAxisGroup = parseAxisGroup(this, channel_1.X);
        var yAxisGroup = parseAxisGroup(this, channel_1.Y);
        this.component.axisGroup = util_1.extend(xAxisGroup ? { x: xAxisGroup } : {}, yAxisGroup ? { y: yAxisGroup } : {});
    };
    FacetModel.prototype.parseGridGroup = function () {
        var child = this.child();
        this.component.gridGroup = util_1.extend(!child.has(channel_1.X) && this.has(channel_1.COLUMN) ? { column: getColumnGridGroups(this) } : {}, !child.has(channel_1.Y) && this.has(channel_1.ROW) ? { row: getRowGridGroups(this) } : {});
    };
    FacetModel.prototype.parseLegend = function () {
        this.child().parseLegend();
        this.component.legend = this._child.component.legend;
        this._child.component.legend = {};
    };
    FacetModel.prototype.assembleParentGroupProperties = function () {
        return null;
    };
    FacetModel.prototype.assembleData = function (data) {
        data_2.assembleData(this, data);
        return this._child.assembleData(data);
    };
    FacetModel.prototype.assembleLayout = function (layoutData) {
        this._child.assembleLayout(layoutData);
        return layout_1.assembleLayout(this, layoutData);
    };
    FacetModel.prototype.assembleMarks = function () {
        return [].concat(util_1.vals(this.component.axisGroup), util_1.flatten(util_1.vals(this.component.gridGroup)), this.component.mark);
    };
    FacetModel.prototype.channels = function () {
        return [channel_1.ROW, channel_1.COLUMN];
    };
    FacetModel.prototype.mapping = function () {
        return this.facet();
    };
    FacetModel.prototype.isFacet = function () {
        return true;
    };
    return FacetModel;
}(model_1.Model));
exports.FacetModel = FacetModel;
function getFacetGroupProperties(model) {
    var child = model.child();
    var mergedCellConfig = util_1.extend({}, child.config().cell, child.config().facet.cell);
    return util_1.extend({
        x: model.has(channel_1.COLUMN) ? {
            scale: model.scaleName(channel_1.COLUMN),
            field: model.field(channel_1.COLUMN),
            offset: model.scale(channel_1.COLUMN).padding / 2
        } : { value: model.config().facet.scale.padding / 2 },
        y: model.has(channel_1.ROW) ? {
            scale: model.scaleName(channel_1.ROW),
            field: model.field(channel_1.ROW),
            offset: model.scale(channel_1.ROW).padding / 2
        } : { value: model.config().facet.scale.padding / 2 },
        width: { field: { parent: model.child().sizeName('width') } },
        height: { field: { parent: model.child().sizeName('height') } }
    }, child.assembleParentGroupProperties(mergedCellConfig));
}
function parseAxisGroup(model, channel) {
    var axisGroup = null;
    var child = model.child();
    if (child.has(channel)) {
        if (child.axis(channel)) {
            if (true) {
                axisGroup = channel === channel_1.X ? getXAxesGroup(model) : getYAxesGroup(model);
                if (child.axis(channel) && axis_2.gridShow(child, channel)) {
                    child.component.axis[channel] = axis_2.parseInnerAxis(channel, child);
                }
                else {
                    delete child.component.axis[channel];
                }
            }
            else {
            }
        }
    }
    return axisGroup;
}
function getXAxesGroup(model) {
    var hasCol = model.has(channel_1.COLUMN);
    return util_1.extend({
        name: model.name('x-axes'),
        type: 'group'
    }, hasCol ? {
        from: {
            data: model.dataTable(),
            transform: [{
                    type: 'aggregate',
                    groupby: [model.field(channel_1.COLUMN)],
                    summarize: { '*': ['count'] }
                }]
        }
    } : {}, {
        properties: {
            update: {
                width: { field: { parent: model.child().sizeName('width') } },
                height: {
                    field: { group: 'height' }
                },
                x: hasCol ? {
                    scale: model.scaleName(channel_1.COLUMN),
                    field: model.field(channel_1.COLUMN),
                    offset: model.scale(channel_1.COLUMN).padding / 2
                } : {
                    value: model.config().facet.scale.padding / 2
                }
            }
        },
        axes: [axis_2.parseAxis(channel_1.X, model.child())]
    });
}
function getYAxesGroup(model) {
    var hasRow = model.has(channel_1.ROW);
    return util_1.extend({
        name: model.name('y-axes'),
        type: 'group'
    }, hasRow ? {
        from: {
            data: model.dataTable(),
            transform: [{
                    type: 'aggregate',
                    groupby: [model.field(channel_1.ROW)],
                    summarize: { '*': ['count'] }
                }]
        }
    } : {}, {
        properties: {
            update: {
                width: {
                    field: { group: 'width' }
                },
                height: { field: { parent: model.child().sizeName('height') } },
                y: hasRow ? {
                    scale: model.scaleName(channel_1.ROW),
                    field: model.field(channel_1.ROW),
                    offset: model.scale(channel_1.ROW).padding / 2
                } : {
                    value: model.config().facet.scale.padding / 2
                }
            }
        },
        axes: [axis_2.parseAxis(channel_1.Y, model.child())]
    });
}
function getRowGridGroups(model) {
    var facetGridConfig = model.config().facet.grid;
    var rowGrid = {
        name: model.name('row-grid'),
        type: 'rule',
        from: {
            data: model.dataTable(),
            transform: [{ type: 'facet', groupby: [model.field(channel_1.ROW)] }]
        },
        properties: {
            update: {
                y: {
                    scale: model.scaleName(channel_1.ROW),
                    field: model.field(channel_1.ROW)
                },
                x: { value: 0, offset: -facetGridConfig.offset },
                x2: { field: { group: 'width' }, offset: facetGridConfig.offset },
                stroke: { value: facetGridConfig.color },
                strokeOpacity: { value: facetGridConfig.opacity },
                strokeWidth: { value: 0.5 }
            }
        }
    };
    return [rowGrid, {
            name: model.name('row-grid-end'),
            type: 'rule',
            properties: {
                update: {
                    y: { field: { group: 'height' } },
                    x: { value: 0, offset: -facetGridConfig.offset },
                    x2: { field: { group: 'width' }, offset: facetGridConfig.offset },
                    stroke: { value: facetGridConfig.color },
                    strokeOpacity: { value: facetGridConfig.opacity },
                    strokeWidth: { value: 0.5 }
                }
            }
        }];
}
function getColumnGridGroups(model) {
    var facetGridConfig = model.config().facet.grid;
    var columnGrid = {
        name: model.name('column-grid'),
        type: 'rule',
        from: {
            data: model.dataTable(),
            transform: [{ type: 'facet', groupby: [model.field(channel_1.COLUMN)] }]
        },
        properties: {
            update: {
                x: {
                    scale: model.scaleName(channel_1.COLUMN),
                    field: model.field(channel_1.COLUMN)
                },
                y: { value: 0, offset: -facetGridConfig.offset },
                y2: { field: { group: 'height' }, offset: facetGridConfig.offset },
                stroke: { value: facetGridConfig.color },
                strokeOpacity: { value: facetGridConfig.opacity },
                strokeWidth: { value: 0.5 }
            }
        }
    };
    return [columnGrid, {
            name: model.name('column-grid-end'),
            type: 'rule',
            properties: {
                update: {
                    x: { field: { group: 'width' } },
                    y: { value: 0, offset: -facetGridConfig.offset },
                    y2: { field: { group: 'height' }, offset: facetGridConfig.offset },
                    stroke: { value: facetGridConfig.color },
                    strokeOpacity: { value: facetGridConfig.opacity },
                    strokeWidth: { value: 0.5 }
                }
            }
        }];
}
//# sourceMappingURL=facet.js.map

/***/ }),

/***/ "J731":
/***/ (function(module, exports) {

var ts = Date.now();

function write(msg) {
  console.log('[Vega Log]', msg);
}

function error(msg) {
  console.error('[Vega Err]', msg);
}

function debug(input, args) {
  if (!debug.enable) return;
  var log = Function.prototype.bind.call(console.log, console);
  var state = {
    prevTime:  Date.now() - ts,
    stamp: input.stamp
  };

  if (input.add) {
    state.add = input.add.length;
    state.mod = input.mod.length;
    state.rem = input.rem.length;
    state.reflow = !!input.reflow;
  }

  log.apply(console, (args.push(JSON.stringify(state)), args));
  ts = Date.now();
}

module.exports = {
  log:   write,
  error: error,
  debug: (debug.enable = false, debug)
};


/***/ }),

/***/ "KMnl":
/***/ (function(module, exports, __webpack_require__) {

var ChangeSet = __webpack_require__("ekYZ"),
    Node = __webpack_require__("3FFs"), // jshint ignore:line
    Base = Node.prototype;

function Signal(graph, name, initialValue) {
  Base.init.call(this, graph);
  this._name  = name;
  this._value = initialValue;
  this._verbose = false; // Verbose signals re-pulse the graph even if prev === val.
  this._handlers = [];
  return this;
}

var prototype = (Signal.prototype = Object.create(Base));
prototype.constructor = Signal;

prototype.name = function() {
  return this._name;
};

prototype.value = function(val) {
  if (!arguments.length) return this._value;
  return (this._value = val, this);
};

// Alias to value, for shared API with DataSource
prototype.values = prototype.value;

prototype.verbose = function(v) {
  if (!arguments.length) return this._verbose;
  return (this._verbose = !!v, this);
};

prototype.evaluate = function(input) {
  return input.signals[this._name] ? input : this._graph.doNotPropagate;
};

prototype.fire = function(cs) {
  if (!cs) cs = ChangeSet.create(null, true);
  cs.signals[this._name] = 1;
  this._graph.propagate(cs, this);
};

prototype.on = function(handler) {
  var signal = this,
      node = new Node(this._graph);

  node.evaluate = function(input) {
    handler(signal.name(), signal.value());
    return input;
  };

  this._handlers.push({
    handler: handler,
    node: node
  });

  return this.addListener(node);
};

prototype.off = function(handler) {
  var h = this._handlers, i, x;

  for (i=h.length; --i>=0;) {
    if (!handler || h[i].handler === handler) {
      x = h.splice(i, 1)[0];
      this.removeListener(x.node);
    }
  }

  return this;
};

module.exports = Signal;


/***/ }),

/***/ "KfF0":
/***/ (function(module, exports) {

function Heap(comparator) {
  this.cmp = comparator;
  this.nodes = [];
}

var prototype = Heap.prototype;

prototype.size = function() {
  return this.nodes.length;
};

prototype.clear = function() {
  return (this.nodes = [], this);
};

prototype.peek = function() {
  return this.nodes[0];
};

prototype.push = function(x) {
  var array = this.nodes;
  array.push(x);
  return _siftdown(array, 0, array.length-1, this.cmp);
};

prototype.pop = function() {
  var array = this.nodes,
      last = array.pop(),
      item;

  if (array.length) {
    item = array[0];
    array[0] = last;
    _siftup(array, 0, this.cmp);
  } else {
    item = last;
  }
  return item;
};

prototype.replace = function(item) {
  var array = this.nodes,
      retval = array[0];
  array[0] = item;
  _siftup(array, 0, this.cmp);
  return retval;
};

prototype.pushpop = function(item) {
  var array = this.nodes, ref = array[0];
  if (array.length && this.cmp(ref, item) < 0) {
    array[0] = item;
    item = ref;
    _siftup(array, 0, this.cmp);
  }
  return item;
};

function _siftdown(array, start, idx, cmp) {
  var item, parent, pidx;

  item = array[idx];
  while (idx > start) {
    pidx = (idx - 1) >> 1;
    parent = array[pidx];
    if (cmp(item, parent) < 0) {
      array[idx] = parent;
      idx = pidx;
      continue;
    }
    break;
  }
  return (array[idx] = item);
}

function _siftup(array, idx, cmp) {
  var start = idx,
      end = array.length,
      item = array[idx],
      cidx = 2 * idx + 1, ridx;

  while (cidx < end) {
    ridx = cidx + 1;
    if (ridx < end && cmp(array[cidx], array[ridx]) >= 0) {
      cidx = ridx;
    }
    array[idx] = array[cidx];
    idx = cidx;
    cidx = 2 * idx + 1;
  }
  array[idx] = item;
  return _siftdown(array, start, idx, cmp);
}

module.exports = Heap;


/***/ }),

/***/ "LHV8":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  path:       __webpack_require__("pfe9"),
  render:     __webpack_require__("WCPv"),
  Item:       __webpack_require__("iMk1"),
  bound:      __webpack_require__("BONk"),
  Bounds:     __webpack_require__("lnKO"),
  canvas:     __webpack_require__("WFOa"),
  Gradient:   __webpack_require__("1C2Q"),
  toJSON:     __webpack_require__("3Gpk").toJSON,
  fromJSON:   __webpack_require__("3Gpk").fromJSON
};

/***/ }),

/***/ "Lp/H":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    bound = __webpack_require__("LHV8").bound,
    Tuple = __webpack_require__("Hqva").Tuple,
    Status = __webpack_require__("Vp7n").STATUS;

function Transition(duration, ease) {
  this.duration = duration || 500;
  this.ease = ease && d3.ease(ease) || d3.ease('cubic-in-out');
  this.updates = {next: null};
}

var prototype = Transition.prototype;

var skip = {
  'text': 1,
  'url':  1
};

prototype.interpolate = function(item, values) {
  var key, curr, next, interp, list = null;

  for (key in values) {
    curr = item[key];
    next = values[key];
    if (curr !== next) {
      if (skip[key] || curr === undefined) {
        // skip interpolation for specific keys or undefined start values
        Tuple.set(item, key, next);
      } else if (typeof curr === 'number' && !isFinite(curr)) {
        // for NaN or infinite numeric values, skip to final value
        Tuple.set(item, key, next);
      } else {
        // otherwise lookup interpolator
        interp = d3.interpolate(curr, next);
        interp.property = key;
        (list || (list=[])).push(interp);
      }
    }
  }

  if (list === null && item.status === Status.EXIT) {
    list = []; // ensure exiting items are included
  }

  if (list != null) {
    list.item = item;
    list.ease = item.mark.ease || this.ease;
    list.next = this.updates.next;
    this.updates.next = list;
  }
  return this;
};

prototype.start = function(callback) {
  var t = this, prev = t.updates, curr = prev.next;
  for (; curr!=null; prev=curr, curr=prev.next) {
    if (curr.item.status === Status.EXIT) {
      // Only mark item as exited when it is removed.
      curr.item.status = Status.UPDATE;
      curr.remove = true;
    }
  }
  t.callback = callback;
  d3.timer(function(elapsed) { return step.call(t, elapsed); });
};

function step(elapsed) {
  var list = this.updates, prev = list, curr = prev.next,
      duration = this.duration,
      item, delay, f, e, i, n, stop = true;

  for (; curr!=null; prev=curr, curr=prev.next) {
    item = curr.item;
    delay = item.delay || 0;

    f = (elapsed - delay) / duration;
    if (f < 0) { stop = false; continue; }
    if (f > 1) f = 1;
    e = curr.ease(f);

    for (i=0, n=curr.length; i<n; ++i) {
      item[curr[i].property] = curr[i](e);
    }
    item.touch();
    bound.item(item);

    if (f === 1) {
      if (curr.remove) {
        item.status = Status.EXIT;
        item.remove();
      }
      prev.next = curr.next;
      curr = prev;
    } else {
      stop = false;
    }
  }

  this.callback();
  return stop;
}

module.exports = Transition;


/***/ }),

/***/ "MRce":
/***/ (function(module, exports) {

module.exports = {
  size:   [{signal: 'width'}, {signal: 'height'}],
  mid:    [{expr: 'width/2'}, {expr: 'height/2'}],
  extent: [
    {expr: '[-padding.left, -padding.top]'},
    {expr: '[width+padding.right, height+padding.bottom]'}
  ]
};

/***/ }),

/***/ "MSrK":
/***/ (function(module, exports) {

module.exports = {
  'NaN':     'NaN',
  'E':       'Math.E',
  'LN2':     'Math.LN2',
  'LN10':    'Math.LN10',
  'LOG2E':   'Math.LOG2E',
  'LOG10E':  'Math.LOG10E',
  'PI':      'Math.PI',
  'SQRT1_2': 'Math.SQRT1_2',
  'SQRT2':   'Math.SQRT2'
};

/***/ }),

/***/ "MZ+b":
/***/ (function(module, exports, __webpack_require__) {

var df = __webpack_require__("Hqva"),
    Tuple = df.Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Fold(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    fields: {type: 'array<field>'}
  });

  this._output = {key: 'key', value: 'value'};
  this._cache = {};

  return this.router(true).produces(true);
}

var prototype = (Fold.prototype = Object.create(Transform.prototype));
prototype.constructor = Fold;

prototype._reset = function(input, output) {
  for (var id in this._cache) {
    output.rem.push.apply(output.rem, this._cache[id]);
  }
  this._cache = {};
};

prototype._tuple = function(x, i, len) {
  var list = this._cache[x._id] || (this._cache[x._id] = Array(len));
  return list[i] ? Tuple.rederive(x, list[i]) : (list[i] = Tuple.derive(x));
};

prototype._fn = function(data, on, out) {
  var i, j, n, m, d, t;
  for (i=0, n=data.length; i<n; ++i) {
    d = data[i];
    for (j=0, m=on.field.length; j<m; ++j) {
      t = this._tuple(d, j, m);
      Tuple.set(t, this._output.key, on.field[j]);
      Tuple.set(t, this._output.value, on.accessor[j](d));
      out.push(t);
    }
  }
};

prototype.transform = function(input, reset) {
  log.debug(input, ['folding']);

  var fold = this,
      on = this.param('fields'),
      output = df.ChangeSet.create(input);

  if (reset) this._reset(input, output);

  this._fn(input.add, on, output.add);
  this._fn(input.mod, on, reset ? output.add : output.mod);
  input.rem.forEach(function(x) {
    output.rem.push.apply(output.rem, fold._cache[x._id]);
    fold._cache[x._id] = null;
  });

  // If we're only propagating values, don't mark key/value as updated.
  if (input.add.length || input.rem.length ||
      on.field.some(function(f) { return !!input.fields[f]; })) {
    output.fields[this._output.key] = 1;
    output.fields[this._output.value] = 1;
  }
  return output;
};

module.exports = Fold;

Fold.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Fold transform",
  "description": "Collapse (\"fold\") one or more data properties into two properties.",
  "type": "object",
  "properties": {
    "type": {"enum": ["fold"]},
    "fields": {
      "oneOf": [
        {
          "type": "array",
          "description": "An array of field references indicating the data properties to fold.",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]},
          "minItems": 1,
          "uniqueItems": true
        },
        {"$ref": "#/refs/signal"}
      ]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "key": {"type": "string", "default": "key"},
        "value": {"type": "string", "default": "value"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type", "fields"]
};


/***/ }),

/***/ "MtYt":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var sort_1 = __webpack_require__("yLwJ");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var facet_1 = __webpack_require__("ISRz");
var layer_1 = __webpack_require__("Wwtv");
var timeunit_1 = __webpack_require__("z5TJ");
var unit_1 = __webpack_require__("zYzi");
var spec_1 = __webpack_require__("F9eC");
function buildModel(spec, parent, parentGivenName) {
    if (spec_1.isFacetSpec(spec)) {
        return new facet_1.FacetModel(spec, parent, parentGivenName);
    }
    if (spec_1.isLayerSpec(spec)) {
        return new layer_1.LayerModel(spec, parent, parentGivenName);
    }
    if (spec_1.isUnitSpec(spec)) {
        return new unit_1.UnitModel(spec, parent, parentGivenName);
    }
    console.error('Invalid spec.');
    return null;
}
exports.buildModel = buildModel;
exports.STROKE_CONFIG = ['stroke', 'strokeWidth',
    'strokeDash', 'strokeDashOffset', 'strokeOpacity', 'opacity'];
exports.FILL_CONFIG = ['fill', 'fillOpacity',
    'opacity'];
exports.FILL_STROKE_CONFIG = util_1.union(exports.STROKE_CONFIG, exports.FILL_CONFIG);
function applyColorAndOpacity(p, model) {
    var filled = model.config().mark.filled;
    var colorFieldDef = model.fieldDef(channel_1.COLOR);
    var opacityFieldDef = model.fieldDef(channel_1.OPACITY);
    if (filled) {
        applyMarkConfig(p, model, exports.FILL_CONFIG);
    }
    else {
        applyMarkConfig(p, model, exports.STROKE_CONFIG);
    }
    var colorValue;
    var opacityValue;
    if (model.has(channel_1.COLOR)) {
        colorValue = {
            scale: model.scaleName(channel_1.COLOR),
            field: model.field(channel_1.COLOR, colorFieldDef.type === type_1.ORDINAL ? { prefn: 'rank_' } : {})
        };
    }
    else if (colorFieldDef && colorFieldDef.value) {
        colorValue = { value: colorFieldDef.value };
    }
    if (model.has(channel_1.OPACITY)) {
        opacityValue = {
            scale: model.scaleName(channel_1.OPACITY),
            field: model.field(channel_1.OPACITY, opacityFieldDef.type === type_1.ORDINAL ? { prefn: 'rank_' } : {})
        };
    }
    else if (opacityFieldDef && opacityFieldDef.value) {
        opacityValue = { value: opacityFieldDef.value };
    }
    if (colorValue !== undefined) {
        if (filled) {
            p.fill = colorValue;
        }
        else {
            p.stroke = colorValue;
        }
    }
    else {
        p[filled ? 'fill' : 'stroke'] = p[filled ? 'fill' : 'stroke'] ||
            { value: model.config().mark.color };
    }
    if (opacityValue !== undefined) {
        p.opacity = opacityValue;
    }
}
exports.applyColorAndOpacity = applyColorAndOpacity;
function applyConfig(properties, config, propsList) {
    propsList.forEach(function (property) {
        var value = config[property];
        if (value !== undefined) {
            properties[property] = { value: value };
        }
    });
    return properties;
}
exports.applyConfig = applyConfig;
function applyMarkConfig(marksProperties, model, propsList) {
    return applyConfig(marksProperties, model.config().mark, propsList);
}
exports.applyMarkConfig = applyMarkConfig;
function numberFormat(fieldDef, format, config) {
    if (fieldDef.type === type_1.QUANTITATIVE && !fieldDef.bin) {
        return format || config.numberFormat;
    }
    return undefined;
}
exports.numberFormat = numberFormat;
function sortField(orderChannelDef) {
    return (orderChannelDef.sort === sort_1.SortOrder.DESCENDING ? '-' : '') +
        fielddef_1.field(orderChannelDef, { binSuffix: '_mid' });
}
exports.sortField = sortField;
function timeTemplate(templateField, timeUnit, format, shortTimeLabels, config) {
    if (!timeUnit || format) {
        var _format = format || config.timeFormat;
        return '{{' + templateField + ' | time:\'' + _format + '\'}}';
    }
    else {
        return timeunit_1.template(timeUnit, templateField, shortTimeLabels);
    }
}
exports.timeTemplate = timeTemplate;
//# sourceMappingURL=common.js.map

/***/ }),

/***/ "NNYs":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    log = __webpack_require__("J731"),
    Node = df.Node, // jshint ignore:line
    Deps = df.Dependencies,
    Aggregate = __webpack_require__("3Y21");

var Properties = {
  width: 1,
  height: 1
};

var Types = {
  LINEAR: 'linear',
  ORDINAL: 'ordinal',
  LOG: 'log',
  POWER: 'pow',
  SQRT: 'sqrt',
  TIME: 'time',
  TIME_UTC: 'utc',
  QUANTILE: 'quantile',
  QUANTIZE: 'quantize',
  THRESHOLD: 'threshold'
};

var DataRef = {
  DOMAIN: 'domain',
  RANGE: 'range',

  COUNT: 'count',
  GROUPBY: 'groupby',
  MIN: 'min',
  MAX: 'max',
  VALUE: 'value',

  ASC: 'asc',
  DESC: 'desc'
};

function Scale(graph, def, parent) {
  this._def     = def;
  this._parent  = parent;
  this._updated = false;
  return Node.prototype.init.call(this, graph).reflows(true);
}

var proto = (Scale.prototype = new Node());

proto.evaluate = function(input) {
  var self = this,
      fn = function(group) { scale.call(self, group); };

  this._updated = false;
  input.add.forEach(fn);
  input.mod.forEach(fn);

  // Scales are at the end of an encoding pipeline, so they should forward a
  // reflow pulse. Thus, if multiple scales update in the parent group, we don't
  // reevaluate child marks multiple times.
  if (this._updated) {
    input.scales[this._def.name] = 1;
    log.debug(input, ["scale", this._def.name]);
  }
  return df.ChangeSet.create(input, true);
};

// All of a scale's dependencies are registered during propagation as we parse
// dataRefs. So a scale must be responsible for connecting itself to dependents.
proto.dependency = function(type, deps) {
  if (arguments.length == 2) {
    var method = (type === Deps.DATA ? 'data' : 'signal');
    deps = dl.array(deps);
    for (var i=0, len=deps.length; i<len; ++i) {
      this._graph[method](deps[i]).addListener(this._parent);
    }
  }

  return Node.prototype.dependency.call(this, type, deps);
};

function scale(group) {
  var name = this._def.name,
      prev = name + ':prev',
      s = instance.call(this, group.scale(name)),
      m = s.type===Types.ORDINAL ? ordinal : quantitative,
      rng = range.call(this, group);

  m.call(this, s, rng, group);

  group.scale(name, s);
  group.scale(prev, group.scale(prev) || s);

  return s;
}

function instance(scale) {
  var config = this._graph.config(),
      type = this._def.type || Types.LINEAR;
  if (!scale || type !== scale.type) {
    var ctor = config.scale[type] || d3.scale[type];
    if (!ctor) throw Error('Unrecognized scale type: ' + type);
    (scale = ctor()).type = scale.type || type;
    scale.scaleName = this._def.name;
    scale._prev = {};
  }
  return scale;
}

function ordinal(scale, rng, group) {
  var def = this._def,
      prev = scale._prev,
      dataDrivenRange = false,
      pad = signal.call(this, def.padding) || 0,
      outer  = def.outerPadding == null ? pad : signal.call(this, def.outerPadding),
      points = def.points && signal.call(this, def.points),
      round  = signal.call(this, def.round) || def.round == null,
      domain, str, spatial=true;

  // range pre-processing for data-driven ranges
  if (dl.isObject(def.range) && !dl.isArray(def.range)) {
    dataDrivenRange = true;
    rng = dataRef.call(this, DataRef.RANGE, def.range, scale, group);
  }

  // domain
  domain = dataRef.call(this, DataRef.DOMAIN, def.domain, scale, group);
  if (domain && !dl.equal(prev.domain, domain)) {
    scale.domain(domain);
    prev.domain = domain;
    this._updated = true;
  }

  // range
  if (!dl.equal(prev.range, rng)) {
    // width-defined range
    if (def.bandSize) {
      var bw = signal.call(this, def.bandSize),
          len = domain.length,
          space = def.points ? (pad*bw) : (pad*bw*(len-1) + 2*outer),
          start;
      if (rng[0] > rng[1]) {
        start = rng[1] || 0;
        rng = [start + (bw * len + space), start];
      } else {
        start = rng[0] || 0;
        rng = [start, start + (bw * len + space)];
      }

      if (def.reverse) rng = rng.reverse();
    }

    str = typeof rng[0] === 'string';
    if (str || rng.length > 2 || rng.length===1 || dataDrivenRange) {
      scale.range(rng); // color or shape values
      spatial = false;
    } else if (points && round) {
      scale.rangeRoundPoints(rng, pad);
    } else if (points) {
      scale.rangePoints(rng, pad);
    } else if (round) {
      scale.rangeRoundBands(rng, pad, outer);
    } else {
      scale.rangeBands(rng, pad, outer);
    }

    prev.range = rng;
    this._updated = true;
  }

  if (!scale.invert && spatial) invertOrdinal(scale);
}

// "Polyfill" ordinal scale inversion. Currently, only ordinal scales
// with ordered numeric ranges are supported.
var bisect = d3.bisector(dl.numcmp).right,
    findAsc = function(a, x) { return bisect(a,x) - 1; },
    findDsc = d3.bisector(function(a,b) { return -1 * dl.numcmp(a,b); }).left;

function invertOrdinal(scale) {
  scale.invert = function(x, y) {
    var rng = scale.range(),
        asc = rng[0] < rng[1],
        find = asc ? findAsc : findDsc;

    if (arguments.length === 1) {
      if (!dl.isNumber(x)) {
        throw Error('Ordinal scale inversion is only supported for numeric input ('+x+').');
      }
      return scale.domain()[find(rng, x)];

    } else if (arguments.length === 2) {  // Invert extents
      if (!dl.isNumber(x) || !dl.isNumber(y)) {
        throw Error('Extents to ordinal invert are not numbers ('+x+', '+y+').');
      }

      var domain = scale.domain(),
          a = find(rng, x),
          b = find(rng, y),
          n = rng.length - 1, r;
      if (b < a) { r = a; a = b; b = a; } // ensure a <= b
      if (a < 0) a = 0;
      if (b > n) b = n;

      return (asc ? dl.range(a, b+1) : dl.range(b, a-1, -1))
        .map(function(i) { return domain[i]; });
    }
  };
}

function quantitative(scale, rng, group) {
  var def = this._def,
      prev = scale._prev,
      round = signal.call(this, def.round),
      exponent = signal.call(this, def.exponent),
      clamp = signal.call(this, def.clamp),
      nice = signal.call(this, def.nice),
      domain, interval;

  // domain
  domain = (def.type === Types.QUANTILE) ?
    dataRef.call(this, DataRef.DOMAIN, def.domain, scale, group) :
    domainMinMax.call(this, scale, group);
  if (domain && !dl.equal(prev.domain, domain)) {
    scale.domain(domain);
    prev.domain = domain;
    this._updated = true;
  }

  // range
  // vertical scales should flip by default, so use XOR here
  if (signal.call(this, def.range) === 'height') rng = rng.reverse();
  if (rng && !dl.equal(prev.range, rng)) {
    scale[round && scale.rangeRound ? 'rangeRound' : 'range'](rng);
    prev.range = rng;
    this._updated = true;
  }

  if (exponent && def.type===Types.POWER) scale.exponent(exponent);
  if (clamp) scale.clamp(true);
  if (nice) {
    if (def.type === Types.TIME) {
      interval = d3.time[nice];
      if (!interval) log.error('Unrecognized interval: ' + interval);
      scale.nice(interval);
    } else {
      scale.nice();
    }
  }
}

function isUniques(scale) {
  return scale.type === Types.ORDINAL || scale.type === Types.QUANTILE;
}

function getRefs(def) {
  return def.fields || dl.array(def);
}

function inherits(refs) {
  return refs.some(function(r) {
    if (!r.data) return true;
    return r.data && dl.array(r.field).some(function(f) {
      return f.parent;
    });
  });
}

function getFields(ref, group) {
  return dl.array(ref.field).map(function(f) {
    return f.parent ?
      dl.accessor(f.parent)(group.datum) :
      f; // String or {'signal'}
  });
}

// Scale datarefs can be computed over multiple schema types.
// This function determines the type of aggregator created, and
// what data is sent to it: values, tuples, or multi-tuples that must
// be standardized into a consistent schema.
function aggrType(def, scale) {
  var refs = getRefs(def);

  // If we're operating over only a single domain, send full tuples
  // through for efficiency (fewer accessor creations/calls)
  if (refs.length == 1 && dl.array(refs[0].field).length == 1) {
    return Aggregate.TYPES.TUPLE;
  }

  // With quantitative scales, we only care about min/max.
  if (!isUniques(scale)) return Aggregate.TYPES.VALUE;

  // If we don't sort, then we can send values directly to aggrs as well
  if (!dl.isObject(def.sort)) return Aggregate.TYPES.VALUE;

  return Aggregate.TYPES.MULTI;
}

function getCache(which, def, scale, group) {
  var refs = getRefs(def),
      inherit = inherits(refs),
      atype = aggrType(def, scale),
      uniques = isUniques(scale),
      sort = def.sort,
      ck = '_'+which,
      fields = getFields(refs[0], group);

  if (scale[ck] || this[ck]) return scale[ck] || this[ck];

  var cache = new Aggregate(this._graph).type(atype),
      groupby, summarize;

  // If a scale's dataref doesn't inherit data from the group, we can
  // store the dataref aggregator at the Scale (dataflow node) level.
  if (inherit) {
    scale[ck] = cache;
  } else {
    this[ck]  = cache;
  }

  if (uniques) {
    if (atype === Aggregate.TYPES.VALUE) {
      groupby = [{ name: DataRef.GROUPBY, get: dl.identity }];
      summarize = {'*': DataRef.COUNT};
    } else if (atype === Aggregate.TYPES.TUPLE) {
      groupby = [{ name: DataRef.GROUPBY, get: dl.$(fields[0]) }];
      summarize = dl.isObject(sort) ? [{
        field: DataRef.VALUE,
        get:  dl.$(sort.field),
        ops: [sort.op]
      }] : {'*': DataRef.COUNT};
    } else {  // atype === Aggregate.TYPES.MULTI
      groupby   = DataRef.GROUPBY;
      summarize = [{ field: DataRef.VALUE, ops: [sort.op] }];
    }
  } else {
    groupby = [];
    summarize = [{
      field: DataRef.VALUE,
      get: (atype == Aggregate.TYPES.TUPLE) ? dl.$(fields[0]) : dl.identity,
      ops: [DataRef.MIN, DataRef.MAX],
      as:  [DataRef.MIN, DataRef.MAX]
    }];
  }

  cache.param('groupby', groupby)
    .param('summarize', summarize);

  return (cache._lastUpdate = -1, cache);
}

function dataRef(which, def, scale, group) {
  if (def == null) { return []; }
  if (dl.isArray(def)) return def.map(signal.bind(this));

  var self = this, graph = this._graph,
      refs = getRefs(def),
      inherit = inherits(refs),
      atype = aggrType(def, scale),
      cache = getCache.apply(this, arguments),
      sort  = def.sort,
      uniques = isUniques(scale),
      i, rlen, j, flen, ref, fields, field, data, from, cmp;

  function addDep(s) {
    self.dependency(Deps.SIGNALS, s);
  }

  if (inherit || (!inherit && cache._lastUpdate < this._stamp)) {
    for (i=0, rlen=refs.length; i<rlen; ++i) {
      ref = refs[i];
      from = ref.data || group.datum._facetID;
      data = graph.data(from).last();

      if (data.stamp <= this._stamp) continue;

      fields = getFields(ref, group);
      for (j=0, flen=fields.length; j<flen; ++j) {
        field = fields[j];

        if (atype === Aggregate.TYPES.VALUE) {
          cache.accessors(null, field);
        } else if (atype === Aggregate.TYPES.MULTI) {
          cache.accessors(field, ref.sort || sort.field);
        } // Else (Tuple-case) is handled by the aggregator accessors by default

        cache.evaluate(data);
      }

      this.dependency(Deps.DATA, from);
      cache.dependency(Deps.SIGNALS).forEach(addDep);
    }

    cache._lastUpdate = this._stamp;

    data = cache.aggr().result();
    if (uniques) {
      if (dl.isObject(sort)) {
        cmp = sort.op + '_' + DataRef.VALUE;
        cmp = dl.comparator(cmp);
      } else if (sort === true) {
        cmp = dl.comparator(DataRef.GROUPBY);
      }

      if (cmp) data = data.sort(cmp);
      cache._values = data.map(function(d) { return d[DataRef.GROUPBY]; });
    } else {
      data = data[0];
      cache._values = !dl.isValid(data) ? [] : [data[DataRef.MIN], data[DataRef.MAX]];
    }
  }

  return cache._values;
}

function signal(v) {
  if (!v || !v.signal) return v;
  var s = v.signal, ref;
  this.dependency(Deps.SIGNALS, (ref = dl.field(s))[0]);
  return this._graph.signalRef(ref);
}

function domainMinMax(scale, group) {
  var def = this._def,
      domain = [null, null], s, z;

  if (def.domain !== undefined) {
    domain = (!dl.isObject(def.domain)) ? domain :
      dataRef.call(this, DataRef.DOMAIN, def.domain, scale, group);
  }

  z = domain.length - 1;
  if (def.domainMin !== undefined) {
    if (dl.isObject(def.domainMin)) {
      if (def.domainMin.signal) {
        domain[0] = dl.isValid(s=signal.call(this, def.domainMin)) ? s : domain[0];
      } else {
        domain[0] = dataRef.call(this, DataRef.DOMAIN+DataRef.MIN, def.domainMin, scale, group)[0];
      }
    } else {
      domain[0] = def.domainMin;
    }
  }
  if (def.domainMax !== undefined) {
    if (dl.isObject(def.domainMax)) {
      if (def.domainMax.signal) {
        domain[z] = dl.isValid(s=signal.call(this, def.domainMax)) ? s : domain[z];
      } else {
        domain[z] = dataRef.call(this, DataRef.DOMAIN+DataRef.MAX, def.domainMax, scale, group)[1];
      }
    } else {
      domain[z] = def.domainMax;
    }
  }
  if (def.type !== Types.LOG && def.type !== Types.TIME && def.type !== Types.TIME_UTC && (def.zero || def.zero===undefined)) {
    domain[0] = Math.min(0, domain[0]);
    domain[z] = Math.max(0, domain[z]);
  }
  return domain;
}

function range(group) {
  var def = this._def,
      config = this._graph.config(),
      rangeVal = signal.call(this, def.range),
      rng = [null, null];

  if (rangeVal !== undefined) {
    if (typeof rangeVal === 'string') {
      if (Properties[rangeVal]) {
        rng = [0, group[rangeVal]];
      } else if (config.range[rangeVal]) {
        rng = config.range[rangeVal];
      } else {
        log.error('Unrecogized range: ' + rangeVal);
        return rng;
      }
    } else if (dl.isArray(rangeVal)) {
      rng = dl.duplicate(rangeVal).map(signal.bind(this));
    } else if (dl.isObject(rangeVal)) {
      return null; // early exit
    } else {
      rng = [0, rangeVal];
    }
  }
  if (def.rangeMin !== undefined) {
    rng[0] = def.rangeMin.signal ?
      signal.call(this, def.rangeMin) :
      def.rangeMin;
  }
  if (def.rangeMax !== undefined) {
    rng[rng.length-1] = def.rangeMax.signal ?
      signal.call(this, def.rangeMax) :
      def.rangeMax;
  }

  if (def.reverse !== undefined) {
    var rev = signal.call(this, def.reverse);
    if (dl.isObject(rev)) {
      rev = dl.accessor(rev.field)(group.datum);
    }
    if (rev) rng = rng.reverse();
  }

  var start = rng[0], end = rng[rng.length-1];
  if (start === null && end !== null || start !== null && end === null) {
    log.error('Range is underspecified. Please ensure either the ' +
      '"range" property or both "rangeMin" and "rangeMax" are specified.');
  }

  return rng;
}

module.exports = Scale;

var rangeDef = [
  {"enum": ["width", "height", "shapes", "category10", "category20", "category20b", "category20c"]},
  {
    "type": "array",
    "items": {"oneOf": [{"type":"string"}, {"type": "number"}, {"$ref": "#/refs/signal"}]}
  },
  {"$ref": "#/refs/signal"}
];

Scale.schema = {
  "refs": {
    "data": {
      "type": "object",
      "properties": {
        "data": {
          "oneOf": [
            {"type": "string"},
            {
              "type": "object",
              "properties": {
                "fields": {
                  "type": "array",
                  "items": {"$ref": "#/refs/data"}
                }
              },
              "required": ["fields"]
            }
          ]
        },
        "field": {
          "oneOf": [
            {"type": "string"},
            {
              "type": "array",
              "items": {"type": "string"}
            },
            {
              "type": "object",
              "properties": {
                "parent": {"type": "string"}
              },
              "required": ["parent"]
            },
            {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "parent": {"type": "string"}
                },
                "required": ["parent"]
              }
            }
          ]
        },
        "sort": {
          "oneOf": [{"type": "boolean"}, {
            "type": "object",
            "properties": {
              "field": {"type": "string"},
              "op": {"enum": __webpack_require__("3Y21").VALID_OPS}
            }
          }]
        }
      },
      "additionalProperties": false
    }
  },

  "defs": {
    "scale": {
      "title": "Scale function",
      "type": "object",

      "allOf": [{
        "properties": {
          "name": {"type": "string"},

          "type": {
            "enum": [Types.LINEAR, Types.ORDINAL, Types.TIME, Types.TIME_UTC, Types.LOG,
              Types.POWER, Types.SQRT, Types.QUANTILE, Types.QUANTIZE, Types.THRESHOLD],
            "default": Types.LINEAR
          },

          "domain": {
            "oneOf": [
              {
                "type": "array",
                "items": {
                  "oneOf": [
                    {"type":"string"},
                    {"type": "number"},
                    {"$ref": "#/refs/signal"}
                  ]
                }
              },
              {"$ref": "#/refs/data"},
              {
                "type": "object",
                "properties": {
                  "fields": {
                    "type": "array",
                    "items": {"$ref": "#/refs/data"}
                  }
                },
                "required": ["fields"],
              }
            ]
          },

          "domainMin": {
            "oneOf": [
              {"type": "number"},
              {"$ref": "#/refs/data"},
              {"$ref": "#/refs/signal"}
            ]
          },

          "domainMax": {
            "oneOf": [
              {"type": "number"},
              {"$ref": "#/refs/data"},
              {"$ref": "#/refs/signal"}
            ]
          },

          "rangeMin": {
            "oneOf": [
              {"type":"string"},
              {"type": "number"},
              {"$ref": "#/refs/signal"}
            ]
          },

          "rangeMax": {
            "oneOf": [
              {"type":"string"},
              {"type": "number"},
              {"$ref": "#/refs/signal"}
            ]
          },

          "reverse": {
            "oneOf": [
              {"type": "boolean"},
              {"$ref": "#/refs/data"}
            ],
          },
          "round": {"type": "boolean"}
        },

        "required": ["name"]
      }, {
        "oneOf": [{
          "properties": {
            "type": {"enum": [Types.ORDINAL]},

            "range": {
              "oneOf": rangeDef.concat({"$ref": "#/refs/data"})
            },

            "points": {"oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}]},
            "padding": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
            "outerPadding": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
            "bandSize": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]}
          },
          "required": ["type"]
        }, {
          "properties": {
            "type": {"enum": [Types.TIME, Types.TIME_UTC]},
            "range": {"oneOf": rangeDef},
            "clamp": {"oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}]},
            "nice": {"oneOf": [{"enum": ["second", "minute", "hour",
              "day", "week", "month", "year"]}, {"$ref": "#/refs/signal"}]}
          },
          "required": ["type"]
        }, {
          "anyOf": [{
            "properties": {
              "type": {"enum": [Types.LINEAR, Types.LOG, Types.POWER, Types.SQRT,
                Types.QUANTILE, Types.QUANTIZE, Types.THRESHOLD], "default": Types.LINEAR},
              "range": {"oneOf": rangeDef},
              "clamp": {"oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}]},
              "nice": {"oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}]},
              "zero": {"oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}]}
            }
          }, {
            "properties": {
              "type": {"enum": [Types.POWER]},
              "exponent": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]}
            },
            "required": ["type"]
          }]
        }]
      }]
    }
  }
};


/***/ }),

/***/ "NdEd":
/***/ (function(module, exports) {

module.exports = {"name":"datalib","version":"1.8.0","description":"JavaScript utilites for loading, summarizing and working with data.","keywords":["data","table","statistics","parse","csv","tsv","json","utility"],"repository":{"type":"git","url":"http://github.com/vega/datalib.git"},"author":{"name":"Jeffrey Heer","url":"http://idl.cs.washington.edu"},"contributors":[{"name":"Michael Correll","url":"http://pages.cs.wisc.edu/~mcorrell/"},{"name":"Ryan Russell","url":"https://github.com/RussellSprouts"}],"license":"BSD-3-Clause","dependencies":{"d3-dsv":"0.1","d3-format":"0.4","d3-time":"0.1","d3-time-format":"0.2","topojson":"^1.6.19","request":"^2.67.0","sync-request":"^2.1.0"},"devDependencies":{"browserify":"^12.0.1","chai":"^3.4.1","istanbul":"latest","jshint":"^2.9.1-rc1","mocha":"^2.3.4","uglify-js":"^2.6.1"},"main":"src/index.js","scripts":{"deploy":"npm run test && scripts/deploy.sh","lint":"jshint src/","test":"npm run lint && TZ=America/Los_Angeles mocha --recursive test/","cover":"TZ=America/Los_Angeles istanbul cover _mocha -- --recursive test/","build":"browserify src/index.js -d -s dl -o datalib.js","postbuild":"uglifyjs datalib.js -c -m -o datalib.min.js"},"browser":{"buffer":false,"fs":false,"http":false,"request":false,"sync-request":false,"url":false}}

/***/ }),

/***/ "NobO":
/***/ (function(module, exports, __webpack_require__) {

// Word cloud layout by Jason Davies, https://www.jasondavies.com/wordcloud/
// Algorithm due to Jonathan Feinberg, http://static.mrfeinberg.com/bv_ch03.pdf

var dispatch = __webpack_require__("7rLc").dispatch;

var cloudRadians = Math.PI / 180,
    cw = 1 << 11 >> 5,
    ch = 1 << 11;

module.exports = function() {
  var size = [256, 256],
      text = cloudText,
      font = cloudFont,
      fontSize = cloudFontSize,
      fontStyle = cloudFontNormal,
      fontWeight = cloudFontNormal,
      rotate = cloudRotate,
      padding = cloudPadding,
      spiral = archimedeanSpiral,
      words = [],
      timeInterval = Infinity,
      event = dispatch("word", "end"),
      timer = null,
      random = Math.random,
      cloud = {},
      canvas = cloudCanvas;

  cloud.canvas = function(_) {
    return arguments.length ? (canvas = functor(_), cloud) : canvas;
  };

  cloud.start = function() {
    var contextAndRatio = getContext(canvas()),
        board = zeroArray((size[0] >> 5) * size[1]),
        bounds = null,
        n = words.length,
        i = -1,
        tags = [],
        data = words.map(function(d, i) {
          d.text = text.call(this, d, i);
          d.font = font.call(this, d, i);
          d.style = fontStyle.call(this, d, i);
          d.weight = fontWeight.call(this, d, i);
          d.rotate = rotate.call(this, d, i);
          d.size = ~~fontSize.call(this, d, i);
          d.padding = padding.call(this, d, i);
          return d;
        }).sort(function(a, b) { return b.size - a.size; });

    if (timer) clearInterval(timer);
    timer = setInterval(step, 0);
    step();

    return cloud;

    function step() {
      var start = Date.now();
      while (Date.now() - start < timeInterval && ++i < n && timer) {
        var d = data[i];
        d.x = (size[0] * (random() + .5)) >> 1;
        d.y = (size[1] * (random() + .5)) >> 1;
        cloudSprite(contextAndRatio, d, data, i);
        if (d.hasText && place(board, d, bounds)) {
          tags.push(d);
          event.call("word", cloud, d);
          if (bounds) cloudBounds(bounds, d);
          else bounds = [{x: d.x + d.x0, y: d.y + d.y0}, {x: d.x + d.x1, y: d.y + d.y1}];
          // Temporary hack
          d.x -= size[0] >> 1;
          d.y -= size[1] >> 1;
        }
      }
      if (i >= n) {
        cloud.stop();
        event.call("end", cloud, tags, bounds);
      }
    }
  }

  cloud.stop = function() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return cloud;
  };

  function getContext(canvas) {
    canvas.width = canvas.height = 1;
    var ratio = Math.sqrt(canvas.getContext("2d").getImageData(0, 0, 1, 1).data.length >> 2);
    canvas.width = (cw << 5) / ratio;
    canvas.height = ch / ratio;

    var context = canvas.getContext("2d");
    context.fillStyle = context.strokeStyle = "red";
    context.textAlign = "center";

    return {context: context, ratio: ratio};
  }

  function place(board, tag, bounds) {
    var perimeter = [{x: 0, y: 0}, {x: size[0], y: size[1]}],
        startX = tag.x,
        startY = tag.y,
        maxDelta = Math.sqrt(size[0] * size[0] + size[1] * size[1]),
        s = spiral(size),
        dt = random() < .5 ? 1 : -1,
        t = -dt,
        dxdy,
        dx,
        dy;

    while (dxdy = s(t += dt)) {
      dx = ~~dxdy[0];
      dy = ~~dxdy[1];

      if (Math.min(Math.abs(dx), Math.abs(dy)) >= maxDelta) break;

      tag.x = startX + dx;
      tag.y = startY + dy;

      if (tag.x + tag.x0 < 0 || tag.y + tag.y0 < 0 ||
          tag.x + tag.x1 > size[0] || tag.y + tag.y1 > size[1]) continue;
      // TODO only check for collisions within current bounds.
      if (!bounds || !cloudCollide(tag, board, size[0])) {
        if (!bounds || collideRects(tag, bounds)) {
          var sprite = tag.sprite,
              w = tag.width >> 5,
              sw = size[0] >> 5,
              lx = tag.x - (w << 4),
              sx = lx & 0x7f,
              msx = 32 - sx,
              h = tag.y1 - tag.y0,
              x = (tag.y + tag.y0) * sw + (lx >> 5),
              last;
          for (var j = 0; j < h; j++) {
            last = 0;
            for (var i = 0; i <= w; i++) {
              board[x + i] |= (last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0);
            }
            x += sw;
          }
          delete tag.sprite;
          return true;
        }
      }
    }
    return false;
  }

  cloud.timeInterval = function(_) {
    return arguments.length ? (timeInterval = _ == null ? Infinity : _, cloud) : timeInterval;
  };

  cloud.words = function(_) {
    return arguments.length ? (words = _, cloud) : words;
  };

  cloud.size = function(_) {
    return arguments.length ? (size = [+_[0], +_[1]], cloud) : size;
  };

  cloud.font = function(_) {
    return arguments.length ? (font = functor(_), cloud) : font;
  };

  cloud.fontStyle = function(_) {
    return arguments.length ? (fontStyle = functor(_), cloud) : fontStyle;
  };

  cloud.fontWeight = function(_) {
    return arguments.length ? (fontWeight = functor(_), cloud) : fontWeight;
  };

  cloud.rotate = function(_) {
    return arguments.length ? (rotate = functor(_), cloud) : rotate;
  };

  cloud.text = function(_) {
    return arguments.length ? (text = functor(_), cloud) : text;
  };

  cloud.spiral = function(_) {
    return arguments.length ? (spiral = spirals[_] || _, cloud) : spiral;
  };

  cloud.fontSize = function(_) {
    return arguments.length ? (fontSize = functor(_), cloud) : fontSize;
  };

  cloud.padding = function(_) {
    return arguments.length ? (padding = functor(_), cloud) : padding;
  };

  cloud.random = function(_) {
    return arguments.length ? (random = _, cloud) : random;
  };

  cloud.on = function() {
    var value = event.on.apply(event, arguments);
    return value === event ? cloud : value;
  };

  return cloud;
};

function cloudText(d) {
  return d.text;
}

function cloudFont() {
  return "serif";
}

function cloudFontNormal() {
  return "normal";
}

function cloudFontSize(d) {
  return Math.sqrt(d.value);
}

function cloudRotate() {
  return (~~(Math.random() * 6) - 3) * 30;
}

function cloudPadding() {
  return 1;
}

// Fetches a monochrome sprite bitmap for the specified text.
// Load in batches for speed.
function cloudSprite(contextAndRatio, d, data, di) {
  if (d.sprite) return;
  var c = contextAndRatio.context,
      ratio = contextAndRatio.ratio;

  c.clearRect(0, 0, (cw << 5) / ratio, ch / ratio);
  var x = 0,
      y = 0,
      maxh = 0,
      n = data.length;
  --di;
  while (++di < n) {
    d = data[di];
    c.save();
    c.font = d.style + " " + d.weight + " " + ~~((d.size + 1) / ratio) + "px " + d.font;
    var w = c.measureText(d.text + "m").width * ratio,
        h = d.size << 1;
    if (d.rotate) {
      var sr = Math.sin(d.rotate * cloudRadians),
          cr = Math.cos(d.rotate * cloudRadians),
          wcr = w * cr,
          wsr = w * sr,
          hcr = h * cr,
          hsr = h * sr;
      w = (Math.max(Math.abs(wcr + hsr), Math.abs(wcr - hsr)) + 0x1f) >> 5 << 5;
      h = ~~Math.max(Math.abs(wsr + hcr), Math.abs(wsr - hcr));
    } else {
      w = (w + 0x1f) >> 5 << 5;
    }
    if (h > maxh) maxh = h;
    if (x + w >= (cw << 5)) {
      x = 0;
      y += maxh;
      maxh = 0;
    }
    if (y + h >= ch) break;
    c.translate((x + (w >> 1)) / ratio, (y + (h >> 1)) / ratio);
    if (d.rotate) c.rotate(d.rotate * cloudRadians);
    c.fillText(d.text, 0, 0);
    if (d.padding) c.lineWidth = 2 * d.padding, c.strokeText(d.text, 0, 0);
    c.restore();
    d.width = w;
    d.height = h;
    d.xoff = x;
    d.yoff = y;
    d.x1 = w >> 1;
    d.y1 = h >> 1;
    d.x0 = -d.x1;
    d.y0 = -d.y1;
    d.hasText = true;
    x += w;
  }
  var pixels = c.getImageData(0, 0, (cw << 5) / ratio, ch / ratio).data,
      sprite = [];
  while (--di >= 0) {
    d = data[di];
    if (!d.hasText) continue;
    var w = d.width,
        w32 = w >> 5,
        h = d.y1 - d.y0;
    // Zero the buffer
    for (var i = 0; i < h * w32; i++) sprite[i] = 0;
    x = d.xoff;
    if (x == null) return;
    y = d.yoff;
    var seen = 0,
        seenRow = -1;
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        var k = w32 * j + (i >> 5),
            m = pixels[((y + j) * (cw << 5) + (x + i)) << 2] ? 1 << (31 - (i % 32)) : 0;
        sprite[k] |= m;
        seen |= m;
      }
      if (seen) seenRow = j;
      else {
        d.y0++;
        h--;
        j--;
        y++;
      }
    }
    d.y1 = d.y0 + seenRow;
    d.sprite = sprite.slice(0, (d.y1 - d.y0) * w32);
  }
}

// Use mask-based collision detection.
function cloudCollide(tag, board, sw) {
  sw >>= 5;
  var sprite = tag.sprite,
      w = tag.width >> 5,
      lx = tag.x - (w << 4),
      sx = lx & 0x7f,
      msx = 32 - sx,
      h = tag.y1 - tag.y0,
      x = (tag.y + tag.y0) * sw + (lx >> 5),
      last;
  for (var j = 0; j < h; j++) {
    last = 0;
    for (var i = 0; i <= w; i++) {
      if (((last << msx) | (i < w ? (last = sprite[j * w + i]) >>> sx : 0))
          & board[x + i]) return true;
    }
    x += sw;
  }
  return false;
}

function cloudBounds(bounds, d) {
  var b0 = bounds[0],
      b1 = bounds[1];
  if (d.x + d.x0 < b0.x) b0.x = d.x + d.x0;
  if (d.y + d.y0 < b0.y) b0.y = d.y + d.y0;
  if (d.x + d.x1 > b1.x) b1.x = d.x + d.x1;
  if (d.y + d.y1 > b1.y) b1.y = d.y + d.y1;
}

function collideRects(a, b) {
  return a.x + a.x1 > b[0].x && a.x + a.x0 < b[1].x && a.y + a.y1 > b[0].y && a.y + a.y0 < b[1].y;
}

function archimedeanSpiral(size) {
  var e = size[0] / size[1];
  return function(t) {
    return [e * (t *= .1) * Math.cos(t), t * Math.sin(t)];
  };
}

function rectangularSpiral(size) {
  var dy = 4,
      dx = dy * size[0] / size[1],
      x = 0,
      y = 0;
  return function(t) {
    var sign = t < 0 ? -1 : 1;
    // See triangular numbers: T_n = n * (n + 1) / 2.
    switch ((Math.sqrt(1 + 4 * sign * t) - sign) & 3) {
      case 0:  x += dx; break;
      case 1:  y += dy; break;
      case 2:  x -= dx; break;
      default: y -= dy; break;
    }
    return [x, y];
  };
}

// TODO reuse arrays?
function zeroArray(n) {
  var a = [],
      i = -1;
  while (++i < n) a[i] = 0;
  return a;
}

function cloudCanvas() {
  return document.createElement("canvas");
}

function functor(d) {
  return typeof d === "function" ? d : function() { return d; };
}

var spirals = {
  archimedean: archimedeanSpiral,
  rectangular: rectangularSpiral
};


/***/ }),

/***/ "O3lN":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW");

function parsePadding(pad) {
  return pad == null ? 'auto' :
    dl.isObject(pad) ? pad :
    dl.isNumber(pad) ? {top:pad, left:pad, right:pad, bottom:pad} :
    pad === 'strict' ? pad : 'auto';
}

module.exports = parsePadding;
parsePadding.schema = {
  "defs": {
    "padding": {
      "oneOf": [{
        "enum": ["strict", "auto"]
      }, {
        "type": "number"
      }, {
        "type": "object",
        "properties": {
          "top": {"type": "number"},
          "bottom": {"type": "number"},
          "left": {"type": "number"},
          "right": {"type": "number"}
        },
        "additionalProperties": false
      }]
    }
  }
};


/***/ }),

/***/ "OTIj":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    parseTransforms = __webpack_require__("DUWk"),
    parseModify = __webpack_require__("r7he");

function parseData(model, spec, callback) {
  var config = model.config(),
      count = 0;

  function onError(error, d) {
    log.error('PARSE DATA FAILED: ' + d.name + ' ' + error);
    count = -1;
    callback(error);
  }

  function onLoad(d) {
    return function(error, data) {
      if (error) {
        onError(error, d);
      } else if (count > 0) {
        try {
          model.data(d.name).values(dl.read(data, d.format));
          if (--count === 0) callback();
        } catch (err) {
          onError(err, d);
        }
      }
    };
  }

  // process each data set definition
  (spec || []).forEach(function(d) {
    if (d.url) {
      count += 1;
      dl.load(dl.extend({url: d.url}, config.load), onLoad(d));
    }
    try {
      parseData.datasource(model, d);
    } catch (err) {
      onError(err, d);
    }
  });

  if (count === 0) setTimeout(callback, 1);
  return spec;
}

parseData.datasource = function(model, d) {
  var transform = (d.transform || []).map(function(t) {
        return parseTransforms(model, t);
      }),
      mod = (d.modify || []).map(function(m) {
        return parseModify(model, m, d);
      }),
      ds = model.data(d.name, mod.concat(transform));

  if (d.values) {
    ds.values(dl.read(d.values, d.format));
  } else if (d.source) {
    // Derived ds will be pulsed by its src rather than the model.
    ds.source(d.source).addListener(ds);
    model.removeListener(ds.pipeline()[0]);
  }

  return ds;
};

module.exports = parseData;

var parseDef = {
  "oneOf": [
    {"enum": ["auto"]},
    {
      "type": "object",
      "additionalProperties": {
        "enum": ["number", "boolean", "date", "string"]
      }
    }
  ]
};

parseData.schema = {
  "defs": {
    "data": {
      "title": "Input data set definition",
      "type": "object",

      "allOf": [{
        "properties": {
          "name": {"type": "string"},
          "transform": {"$ref": "#/defs/transform"},
          "modify": {"$ref": "#/defs/modify"},
          "format": {
            "type": "object",
            "oneOf": [{
              "properties": {
                "type": {"enum": ["json"]},
                "parse": parseDef,
                "property": {"type": "string"}
              },
              "additionalProperties": false
            }, {
              "properties": {
                "type": {"enum": ["csv", "tsv"]},
                "parse": parseDef
              },
              "additionalProperties": false
            }, {
              "oneOf": [{
                "properties": {
                  "type": {"enum": ["topojson"]},
                  "feature": {"type": "string"}
                },
                "additionalProperties": false
              }, {
                "properties": {
                  "type": {"enum": ["topojson"]},
                  "mesh": {"type": "string"}
                },
                "additionalProperties": false
              }]
            }, {
              "properties": {
                "type": {"enum": ["treejson"]},
                "children": {"type": "string"},
                "parse": parseDef
              },
              "additionalProperties": false
            }]
          }
        },
        "required": ["name"]
      }, {
        "anyOf": [{
          "required": ["name", "modify"]
        }, {
          "oneOf": [{
            "properties": {"source": {"type": "string"}},
            "required": ["source"]
          }, {
            "properties": {"values": {"type": "array"}},
            "required": ["values"]
          }, {
            "properties": {"url": {"type": "string"}},
            "required": ["url"]
          }]
        }]
      }]
    }
  }
};


/***/ }),

/***/ "P/aK":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
(function (Channel) {
    Channel[Channel["X"] = 'x'] = "X";
    Channel[Channel["Y"] = 'y'] = "Y";
    Channel[Channel["X2"] = 'x2'] = "X2";
    Channel[Channel["Y2"] = 'y2'] = "Y2";
    Channel[Channel["ROW"] = 'row'] = "ROW";
    Channel[Channel["COLUMN"] = 'column'] = "COLUMN";
    Channel[Channel["SHAPE"] = 'shape'] = "SHAPE";
    Channel[Channel["SIZE"] = 'size'] = "SIZE";
    Channel[Channel["COLOR"] = 'color'] = "COLOR";
    Channel[Channel["TEXT"] = 'text'] = "TEXT";
    Channel[Channel["DETAIL"] = 'detail'] = "DETAIL";
    Channel[Channel["LABEL"] = 'label'] = "LABEL";
    Channel[Channel["PATH"] = 'path'] = "PATH";
    Channel[Channel["ORDER"] = 'order'] = "ORDER";
    Channel[Channel["OPACITY"] = 'opacity'] = "OPACITY";
})(exports.Channel || (exports.Channel = {}));
var Channel = exports.Channel;
exports.X = Channel.X;
exports.Y = Channel.Y;
exports.X2 = Channel.X2;
exports.Y2 = Channel.Y2;
exports.ROW = Channel.ROW;
exports.COLUMN = Channel.COLUMN;
exports.SHAPE = Channel.SHAPE;
exports.SIZE = Channel.SIZE;
exports.COLOR = Channel.COLOR;
exports.TEXT = Channel.TEXT;
exports.DETAIL = Channel.DETAIL;
exports.LABEL = Channel.LABEL;
exports.PATH = Channel.PATH;
exports.ORDER = Channel.ORDER;
exports.OPACITY = Channel.OPACITY;
exports.CHANNELS = [exports.X, exports.Y, exports.X2, exports.Y2, exports.ROW, exports.COLUMN, exports.SIZE, exports.SHAPE, exports.COLOR, exports.PATH, exports.ORDER, exports.OPACITY, exports.TEXT, exports.DETAIL, exports.LABEL];
exports.UNIT_CHANNELS = util_1.without(exports.CHANNELS, [exports.ROW, exports.COLUMN]);
exports.UNIT_SCALE_CHANNELS = util_1.without(exports.UNIT_CHANNELS, [exports.PATH, exports.ORDER, exports.DETAIL, exports.TEXT, exports.LABEL, exports.X2, exports.Y2]);
exports.NONSPATIAL_CHANNELS = util_1.without(exports.UNIT_CHANNELS, [exports.X, exports.Y, exports.X2, exports.Y2]);
exports.NONSPATIAL_SCALE_CHANNELS = util_1.without(exports.UNIT_SCALE_CHANNELS, [exports.X, exports.Y, exports.X2, exports.Y2]);
exports.STACK_GROUP_CHANNELS = [exports.COLOR, exports.DETAIL, exports.ORDER, exports.OPACITY, exports.SIZE];
;
function supportMark(channel, mark) {
    return !!getSupportedMark(channel)[mark];
}
exports.supportMark = supportMark;
function getSupportedMark(channel) {
    switch (channel) {
        case exports.X:
        case exports.Y:
        case exports.COLOR:
        case exports.DETAIL:
        case exports.ORDER:
        case exports.OPACITY:
        case exports.ROW:
        case exports.COLUMN:
            return {
                point: true, tick: true, rule: true, circle: true, square: true,
                bar: true, line: true, area: true, text: true
            };
        case exports.X2:
        case exports.Y2:
            return {
                rule: true, bar: true, area: true
            };
        case exports.SIZE:
            return {
                point: true, tick: true, rule: true, circle: true, square: true,
                bar: true, text: true
            };
        case exports.SHAPE:
            return { point: true };
        case exports.TEXT:
            return { text: true };
        case exports.PATH:
            return { line: true };
    }
    return {};
}
exports.getSupportedMark = getSupportedMark;
;
function getSupportedRole(channel) {
    switch (channel) {
        case exports.X:
        case exports.Y:
        case exports.COLOR:
        case exports.OPACITY:
        case exports.LABEL:
        case exports.DETAIL:
            return {
                measure: true,
                dimension: true
            };
        case exports.ROW:
        case exports.COLUMN:
        case exports.SHAPE:
            return {
                measure: false,
                dimension: true
            };
        case exports.X2:
        case exports.Y2:
        case exports.SIZE:
        case exports.TEXT:
            return {
                measure: true,
                dimension: false
            };
        case exports.PATH:
            return {
                measure: false,
                dimension: true
            };
    }
    throw new Error('Invalid encoding channel' + channel);
}
exports.getSupportedRole = getSupportedRole;
function hasScale(channel) {
    return !util_1.contains([exports.DETAIL, exports.PATH, exports.TEXT, exports.LABEL, exports.ORDER], channel);
}
exports.hasScale = hasScale;
//# sourceMappingURL=channel.js.map

/***/ }),

/***/ "P7vC":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    Tuple = __webpack_require__("Hqva").Tuple,
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Impute(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    groupby: {type: 'array<field>'},
    orderby: {type: 'array<field>'},
    field:   {type: 'field'},
    method:  {type: 'value', default: 'value'},
    value:   {type: 'value', default: 0}
  });

  return this.router(true).produces(true);
}

var prototype = (Impute.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Impute;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['imputing']);

  var groupby = this.param('groupby'),
      orderby = this.param('orderby'),
      method = this.param('method'),
      value = this.param('value'),
      field = this.param('field'),
      get = field.accessor,
      name = field.field,
      prev = this._imputed || [], curr = [],
      groups = partition(data, groupby.accessor, orderby.accessor),
      domain = groups.domain,
      group, i, j, n, m, t;

  function getval(x) {
    return x == null ? null : get(x);
  }

  for (j=0, m=groups.length; j<m; ++j) {
    group = groups[j];

    // determine imputation value
    if (method !== 'value') {
      value = dl[method](group, getval);
    }

    // add tuples for missing values
    for (i=0, n=group.length; i<n; ++i) {
      if (group[i] == null) {
        t = tuple(groupby.field, group.values, orderby.field, domain[i]);
        t[name] = value;
        curr.push(t);
      }
    }
  }

  // update changeset with imputed tuples
  for (i=0, n=curr.length; i<n; ++i) {
    input.add.push(curr[i]);
  }
  for (i=0, n=prev.length; i<n; ++i) {
    input.rem.push(prev[i]);
  }
  this._imputed = curr;

  return input;
};

function tuple(gb, gv, ob, ov) {
  var t = {_imputed: true}, i;
  for (i=0; i<gv.length; ++i) t[gb[i]] = gv[i];
  for (i=0; i<ov.length; ++i) t[ob[i]] = ov[i];
  return Tuple.ingest(t);
}

function partition(data, groupby, orderby) {
  var groups = [],
      get = function(f) { return f(x); },
      val = function(d) { return (x=d, orderby.map(get)); },
      map, i, x, k, g, domain, lut, N;

  domain = groups.domain = dl.unique(data, val);
  N = domain.length;
  lut = domain.reduce(function(m, d, i) {
    return (m[d] = {value:d, index:i}, m);
  }, {});

  // partition data points into groups
  for (map={}, i=0; i<data.length; ++i) {
    x = data[i];
    k = groupby == null ? [] : groupby.map(get);
    g = map[k] || (groups.push(map[k] = Array(N)), map[k].values = k, map[k]);
    g[lut[val(x)].index] = x;
  }

  return groups;
}

module.exports = Impute;

Impute.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Impute transform",
  "description": "Performs imputation of missing values.",
  "type": "object",
  "properties": {
    "type": {"enum": ["impute"]},
    "method": {
      "description": "The imputation method to use.",
      "oneOf": [
        {"enum": ["value", "mean", "median", "min", "max"]},
        {"$ref": "#/refs/signal"}
      ],
      "default": "value"
    },
    "value": {
      "description": "The value to use for missing data if the method is 'value'.",
      "oneOf": [
        {"type": "number"},
        {"type": "string"},
        {"type": "boolean"},
        {"type": "null"},
        {"$ref": "#/refs/signal"}
      ],
      "default": 0
    },
    "field": {
      "description": "The data field to impute.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "groupby": {
      "description": "A list of fields to group the data into series.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],
    },
    "orderby": {
      "description": "A list of fields to determine ordering within series.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],
    }
  },
  "additionalProperties": false,
  "required": ["type", "groupby", "orderby", "field"]
};


/***/ }),

/***/ "PwiD":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    ChangeSet = df.ChangeSet,
    Base = df.Graph.prototype,
    Node  = df.Node, // jshint ignore:line
    GroupBuilder = __webpack_require__("BB2X"),
    visit = __webpack_require__("Qpkz"),
    compiler = __webpack_require__("TrdW"),
    config = __webpack_require__("8NMF");

function Model(cfg) {
  this._defs = {};
  this._predicates = {};

  this._scene  = null;  // Root scenegraph node.
  this._groups = null;  // Index of group items.

  this._node = null;
  this._builder = null; // Top-level scenegraph builder.

  this._reset = {axes: false, legends: false};

  this.config(cfg);
  this.expr = compiler(this);
  Base.init.call(this);
}

var prototype = (Model.prototype = Object.create(Base));
prototype.constructor = Model;

prototype.defs = function(defs) {
  if (!arguments.length) return this._defs;
  this._defs = defs;
  return this;
};

prototype.config = function(cfg) {
  if (!arguments.length) return this._config;
  this._config = Object.create(config);
  for (var name in cfg) {
    var x = cfg[name], y = this._config[name];
    if (dl.isObject(x) && dl.isObject(y)) {
      this._config[name] = dl.extend({}, y, x);
    } else {
      this._config[name] = x;
    }
  }

  return this;
};

prototype.width = function(width) {
  if (this._defs) this._defs.width = width;
  if (this._defs && this._defs.marks) this._defs.marks.width = width;
  if (this._scene) {
    this._scene.items[0].width = width;
    this._scene.items[0]._dirty = true;
  }
  this._reset.axes = true;
  return this;
};

prototype.height = function(height) {
  if (this._defs) this._defs.height = height;
  if (this._defs && this._defs.marks) this._defs.marks.height = height;
  if (this._scene) {
    this._scene.items[0].height = height;
    this._scene.items[0]._dirty = true;
  }
  this._reset.axes = true;
  return this;
};

prototype.node = function() {
  return this._node || (this._node = new Node(this));
};

prototype.data = function() {
  var data = Base.data.apply(this, arguments);
  if (arguments.length > 1) {  // new Datasource
    this.node().addListener(data.pipeline()[0]);
  }
  return data;
};

function predicates(name) {
  var m = this, pred = {};
  if (!dl.isArray(name)) return this._predicates[name];
  name.forEach(function(n) { pred[n] = m._predicates[n]; });
  return pred;
}

prototype.predicate = function(name, predicate) {
  if (arguments.length === 1) return predicates.call(this, name);
  return (this._predicates[name] = predicate);
};

prototype.predicates = function() { return this._predicates; };

prototype.scene = function(renderer) {
  if (!arguments.length) return this._scene;

  if (this._builder) {
    this.node().removeListener(this._builder);
    this._builder._groupBuilder.disconnect();
  }

  var m = this,
      b = this._builder = new Node(this);

  b.evaluate = function(input) {
    if (b._groupBuilder) return input;

    var gb = b._groupBuilder = new GroupBuilder(m, m._defs.marks, m._scene={}),
        p  = gb.pipeline();

    m._groups = {};
    this.addListener(gb.connect());
    p[p.length-1].addListener(renderer);
    return input;
  };

  this.addListener(b);
  return this;
};

prototype.group = function(id, item) {
  var groups = this._groups;
  if (arguments.length === 1) return groups[id];
  return (groups[id] = item, this);
};

prototype.reset = function() {
  if (this._scene && this._reset.axes) {
    visit(this._scene, function(item) {
      if (item.axes) item.axes.forEach(function(axis) { axis.reset(); });
    });
    this._reset.axes = false;
  }
  if (this._scene && this._reset.legends) {
    visit(this._scene, function(item) {
      if (item.legends) item.legends.forEach(function(l) { l.reset(); });
    });
    this._reset.legends = false;
  }
  return this;
};

prototype.addListener = function(l) {
  this.node().addListener(l);
};

prototype.removeListener = function(l) {
  this.node().removeListener(l);
};

prototype.fire = function(cs) {
  if (!cs) cs = ChangeSet.create();
  this.propagate(cs, this.node());
};

module.exports = Model;


/***/ }),

/***/ "Py5Z":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var scale_1 = __webpack_require__("Fw/k");
var axis_1 = __webpack_require__("cihr");
var legend_1 = __webpack_require__("ZE31");
exports.defaultCellConfig = {
    width: 200,
    height: 200
};
exports.defaultFacetCellConfig = {
    stroke: '#ccc',
    strokeWidth: 1
};
var defaultFacetGridConfig = {
    color: '#000000',
    opacity: 0.4,
    offset: 0
};
exports.defaultFacetConfig = {
    scale: scale_1.defaultFacetScaleConfig,
    axis: axis_1.defaultFacetAxisConfig,
    grid: defaultFacetGridConfig,
    cell: exports.defaultFacetCellConfig
};
(function (FontWeight) {
    FontWeight[FontWeight["NORMAL"] = 'normal'] = "NORMAL";
    FontWeight[FontWeight["BOLD"] = 'bold'] = "BOLD";
})(exports.FontWeight || (exports.FontWeight = {}));
var FontWeight = exports.FontWeight;
(function (Shape) {
    Shape[Shape["CIRCLE"] = 'circle'] = "CIRCLE";
    Shape[Shape["SQUARE"] = 'square'] = "SQUARE";
    Shape[Shape["CROSS"] = 'cross'] = "CROSS";
    Shape[Shape["DIAMOND"] = 'diamond'] = "DIAMOND";
    Shape[Shape["TRIANGLEUP"] = 'triangle-up'] = "TRIANGLEUP";
    Shape[Shape["TRIANGLEDOWN"] = 'triangle-down'] = "TRIANGLEDOWN";
})(exports.Shape || (exports.Shape = {}));
var Shape = exports.Shape;
(function (HorizontalAlign) {
    HorizontalAlign[HorizontalAlign["LEFT"] = 'left'] = "LEFT";
    HorizontalAlign[HorizontalAlign["RIGHT"] = 'right'] = "RIGHT";
    HorizontalAlign[HorizontalAlign["CENTER"] = 'center'] = "CENTER";
})(exports.HorizontalAlign || (exports.HorizontalAlign = {}));
var HorizontalAlign = exports.HorizontalAlign;
(function (VerticalAlign) {
    VerticalAlign[VerticalAlign["TOP"] = 'top'] = "TOP";
    VerticalAlign[VerticalAlign["MIDDLE"] = 'middle'] = "MIDDLE";
    VerticalAlign[VerticalAlign["BOTTOM"] = 'bottom'] = "BOTTOM";
})(exports.VerticalAlign || (exports.VerticalAlign = {}));
var VerticalAlign = exports.VerticalAlign;
(function (FontStyle) {
    FontStyle[FontStyle["NORMAL"] = 'normal'] = "NORMAL";
    FontStyle[FontStyle["ITALIC"] = 'italic'] = "ITALIC";
})(exports.FontStyle || (exports.FontStyle = {}));
var FontStyle = exports.FontStyle;
(function (Interpolate) {
    Interpolate[Interpolate["LINEAR"] = 'linear'] = "LINEAR";
    Interpolate[Interpolate["LINEAR_CLOSED"] = 'linear-closed'] = "LINEAR_CLOSED";
    Interpolate[Interpolate["STEP"] = 'step'] = "STEP";
    Interpolate[Interpolate["STEP_BEFORE"] = 'step-before'] = "STEP_BEFORE";
    Interpolate[Interpolate["STEP_AFTER"] = 'step-after'] = "STEP_AFTER";
    Interpolate[Interpolate["BASIS"] = 'basis'] = "BASIS";
    Interpolate[Interpolate["BASIS_OPEN"] = 'basis-open'] = "BASIS_OPEN";
    Interpolate[Interpolate["BASIS_CLOSED"] = 'basis-closed'] = "BASIS_CLOSED";
    Interpolate[Interpolate["CARDINAL"] = 'cardinal'] = "CARDINAL";
    Interpolate[Interpolate["CARDINAL_OPEN"] = 'cardinal-open'] = "CARDINAL_OPEN";
    Interpolate[Interpolate["CARDINAL_CLOSED"] = 'cardinal-closed'] = "CARDINAL_CLOSED";
    Interpolate[Interpolate["BUNDLE"] = 'bundle'] = "BUNDLE";
    Interpolate[Interpolate["MONOTONE"] = 'monotone'] = "MONOTONE";
})(exports.Interpolate || (exports.Interpolate = {}));
var Interpolate = exports.Interpolate;
(function (AreaOverlay) {
    AreaOverlay[AreaOverlay["LINE"] = 'line'] = "LINE";
    AreaOverlay[AreaOverlay["LINEPOINT"] = 'linepoint'] = "LINEPOINT";
    AreaOverlay[AreaOverlay["NONE"] = 'none'] = "NONE";
})(exports.AreaOverlay || (exports.AreaOverlay = {}));
var AreaOverlay = exports.AreaOverlay;
exports.defaultOverlayConfig = {
    line: false,
    pointStyle: { filled: true },
    lineStyle: {}
};
exports.defaultMarkConfig = {
    color: '#4682b4',
    shape: Shape.CIRCLE,
    strokeWidth: 2,
    size: 30,
    barThinSize: 2,
    ruleSize: 1,
    tickThickness: 1,
    fontSize: 10,
    baseline: VerticalAlign.MIDDLE,
    text: 'Abc',
    shortTimeLabels: false,
    applyColorToBackground: false
};
exports.defaultConfig = {
    numberFormat: 's',
    timeFormat: '%Y-%m-%d',
    countTitle: 'Number of Records',
    cell: exports.defaultCellConfig,
    mark: exports.defaultMarkConfig,
    overlay: exports.defaultOverlayConfig,
    scale: scale_1.defaultScaleConfig,
    axis: axis_1.defaultAxisConfig,
    legend: legend_1.defaultLegendConfig,
    facet: exports.defaultFacetConfig,
};
//# sourceMappingURL=config.js.map

/***/ }),

/***/ "QNWf":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var aggregate_1 = __webpack_require__("h/tW");
var data_1 = __webpack_require__("x6Fv");
var fielddef_1 = __webpack_require__("o+e1");
var util_1 = __webpack_require__("ZAUf");
var summary;
(function (summary) {
    function addDimension(dims, fieldDef) {
        if (fieldDef.bin) {
            dims[fielddef_1.field(fieldDef, { binSuffix: '_start' })] = true;
            dims[fielddef_1.field(fieldDef, { binSuffix: '_mid' })] = true;
            dims[fielddef_1.field(fieldDef, { binSuffix: '_end' })] = true;
            dims[fielddef_1.field(fieldDef, { binSuffix: '_range' })] = true;
        }
        else {
            dims[fielddef_1.field(fieldDef)] = true;
        }
        return dims;
    }
    function parseUnit(model) {
        var dims = {};
        var meas = {};
        model.forEach(function (fieldDef, channel) {
            if (fieldDef.aggregate) {
                if (fieldDef.aggregate === aggregate_1.AggregateOp.COUNT) {
                    meas['*'] = meas['*'] || {};
                    meas['*']['count'] = true;
                }
                else {
                    meas[fieldDef.field] = meas[fieldDef.field] || {};
                    meas[fieldDef.field][fieldDef.aggregate] = true;
                }
            }
            else {
                addDimension(dims, fieldDef);
            }
        });
        return [{
                name: model.dataName(data_1.SUMMARY),
                dimensions: dims,
                measures: meas
            }];
    }
    summary.parseUnit = parseUnit;
    function parseFacet(model) {
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source && childDataComponent.summary) {
            var summaryComponents = childDataComponent.summary.map(function (summaryComponent) {
                summaryComponent.dimensions = model.reduce(addDimension, summaryComponent.dimensions);
                var summaryNameWithoutPrefix = summaryComponent.name.substr(model.child().name('').length);
                model.child().renameData(summaryComponent.name, summaryNameWithoutPrefix);
                summaryComponent.name = summaryNameWithoutPrefix;
                return summaryComponent;
            });
            delete childDataComponent.summary;
            return summaryComponents;
        }
        return [];
    }
    summary.parseFacet = parseFacet;
    function mergeMeasures(parentMeasures, childMeasures) {
        for (var field_1 in childMeasures) {
            if (childMeasures.hasOwnProperty(field_1)) {
                var ops = childMeasures[field_1];
                for (var op in ops) {
                    if (ops.hasOwnProperty(op)) {
                        if (field_1 in parentMeasures) {
                            parentMeasures[field_1][op] = true;
                        }
                        else {
                            parentMeasures[field_1] = { op: true };
                        }
                    }
                }
            }
        }
    }
    function parseLayer(model) {
        var summaries = {};
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (!childDataComponent.source && childDataComponent.summary) {
                childDataComponent.summary.forEach(function (childSummary) {
                    var key = util_1.hash(childSummary.dimensions);
                    if (key in summaries) {
                        mergeMeasures(summaries[key].measures, childSummary.measures);
                    }
                    else {
                        childSummary.name = model.dataName(data_1.SUMMARY) + '_' + util_1.keys(summaries).length;
                        summaries[key] = childSummary;
                    }
                    child.renameData(child.dataName(data_1.SUMMARY), summaries[key].name);
                    delete childDataComponent.summary;
                });
            }
        });
        return util_1.vals(summaries);
    }
    summary.parseLayer = parseLayer;
    function assemble(component, model) {
        if (!component.summary) {
            return [];
        }
        return component.summary.reduce(function (summaryData, summaryComponent) {
            var dims = summaryComponent.dimensions;
            var meas = summaryComponent.measures;
            var groupby = util_1.keys(dims);
            var summarize = util_1.reduce(meas, function (aggregator, fnDictSet, field) {
                aggregator[field] = util_1.keys(fnDictSet);
                return aggregator;
            }, {});
            if (util_1.keys(meas).length > 0) {
                summaryData.push({
                    name: summaryComponent.name,
                    source: model.dataName(data_1.SOURCE),
                    transform: [{
                            type: 'aggregate',
                            groupby: groupby,
                            summarize: summarize
                        }]
                });
            }
            return summaryData;
        }, []);
    }
    summary.assemble = assemble;
})(summary = exports.summary || (exports.summary = {}));
//# sourceMappingURL=summary.js.map

/***/ }),

/***/ "QSMf":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var util_1 = __webpack_require__("ZAUf");
function countRetinal(encoding) {
    var count = 0;
    if (encoding.color) {
        count++;
    }
    if (encoding.opacity) {
        count++;
    }
    if (encoding.size) {
        count++;
    }
    if (encoding.shape) {
        count++;
    }
    return count;
}
exports.countRetinal = countRetinal;
function channels(encoding) {
    return channel_1.CHANNELS.filter(function (channel) {
        return has(encoding, channel);
    });
}
exports.channels = channels;
function has(encoding, channel) {
    var channelEncoding = encoding && encoding[channel];
    return channelEncoding && (channelEncoding.field !== undefined ||
        (util_1.isArray(channelEncoding) && channelEncoding.length > 0));
}
exports.has = has;
function isAggregate(encoding) {
    return util_1.some(channel_1.CHANNELS, function (channel) {
        if (has(encoding, channel) && encoding[channel].aggregate) {
            return true;
        }
        return false;
    });
}
exports.isAggregate = isAggregate;
function isRanged(encoding) {
    return encoding && ((!!encoding.x && !!encoding.x2) || (!!encoding.y && !!encoding.y2));
}
exports.isRanged = isRanged;
function fieldDefs(encoding) {
    var arr = [];
    channel_1.CHANNELS.forEach(function (channel) {
        if (has(encoding, channel)) {
            if (util_1.isArray(encoding[channel])) {
                encoding[channel].forEach(function (fieldDef) {
                    arr.push(fieldDef);
                });
            }
            else {
                arr.push(encoding[channel]);
            }
        }
    });
    return arr;
}
exports.fieldDefs = fieldDefs;
;
function forEach(encoding, f, thisArg) {
    channelMappingForEach(channel_1.CHANNELS, encoding, f, thisArg);
}
exports.forEach = forEach;
function channelMappingForEach(channels, mapping, f, thisArg) {
    var i = 0;
    channels.forEach(function (channel) {
        if (has(mapping, channel)) {
            if (util_1.isArray(mapping[channel])) {
                mapping[channel].forEach(function (fieldDef) {
                    f.call(thisArg, fieldDef, channel, i++);
                });
            }
            else {
                f.call(thisArg, mapping[channel], channel, i++);
            }
        }
    });
}
exports.channelMappingForEach = channelMappingForEach;
function map(encoding, f, thisArg) {
    return channelMappingMap(channel_1.CHANNELS, encoding, f, thisArg);
}
exports.map = map;
function channelMappingMap(channels, mapping, f, thisArg) {
    var arr = [];
    channels.forEach(function (channel) {
        if (has(mapping, channel)) {
            if (util_1.isArray(mapping[channel])) {
                mapping[channel].forEach(function (fieldDef) {
                    arr.push(f.call(thisArg, fieldDef, channel));
                });
            }
            else {
                arr.push(f.call(thisArg, mapping[channel], channel));
            }
        }
    });
    return arr;
}
exports.channelMappingMap = channelMappingMap;
function reduce(encoding, f, init, thisArg) {
    return channelMappingReduce(channel_1.CHANNELS, encoding, f, init, thisArg);
}
exports.reduce = reduce;
function channelMappingReduce(channels, mapping, f, init, thisArg) {
    var r = init;
    channel_1.CHANNELS.forEach(function (channel) {
        if (has(mapping, channel)) {
            if (util_1.isArray(mapping[channel])) {
                mapping[channel].forEach(function (fieldDef) {
                    r = f.call(thisArg, r, fieldDef, channel);
                });
            }
            else {
                r = f.call(thisArg, r, mapping[channel], channel);
            }
        }
    });
    return r;
}
exports.channelMappingReduce = channelMappingReduce;
//# sourceMappingURL=encoding.js.map

/***/ }),

/***/ "Qpkz":
/***/ (function(module, exports) {

module.exports = function visit(node, func) {
  var i, n, s, m, items;
  if (func(node)) return true;

  var sets = ['items', 'axisItems', 'legendItems'];
  for (s=0, m=sets.length; s<m; ++s) {
    if ((items = node[sets[s]])) {
      for (i=0, n=items.length; i<n; ++i) {
        if (visit(items[i], func)) return true;
      }
    }
  }
};


/***/ }),

/***/ "QvNu":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Aggregator = dl.Aggregator,
    Base = Aggregator.prototype,
    df = __webpack_require__("Hqva"),
    Tuple = df.Tuple,
    log = __webpack_require__("J731"),
    facetID = 0;

function Facetor() {
  Aggregator.call(this);
  this._facet = null;
  this._facetID = ++facetID;
}

var prototype = (Facetor.prototype = Object.create(Base));
prototype.constructor = Facetor;

prototype.facet = function(f) {
  return arguments.length ? (this._facet = f, this) : this._facet;
};

prototype._ingest = function(t) {
  return Tuple.ingest(t, null);
};

prototype._assign = Tuple.set;

function disconnect_cell(facet) {
  log.debug({}, ['disconnecting cell', this.tuple._id]);
  var pipeline = this.ds.pipeline();
  facet.removeListener(pipeline[0]);
  facet._graph.removeListener(pipeline[0]);
  facet._graph.disconnect(pipeline);
}

prototype._newcell = function(x, key) {
  var cell  = Base._newcell.call(this, x, key),
      facet = this._facet;

  if (facet) {
    var graph = facet._graph,
        tuple = cell.tuple,
        pipeline = facet.param('transform');
    cell.ds = graph.data(tuple._facetID, pipeline, tuple);
    cell.disconnect = disconnect_cell;
    facet.addListener(pipeline[0]);
  }

  return cell;
};

prototype._newtuple = function(x, key) {
  var t = Base._newtuple.call(this, x);
  if (this._facet) {
    Tuple.set(t, 'key', key);
    Tuple.set(t, '_facetID', this._facetID + '_' + key);
  }
  return t;
};

prototype.clear = function() {
  if (this._facet) {
    for (var k in this._cells) {
      this._cells[k].disconnect(this._facet);
    }
  }
  return Base.clear.call(this);
};

prototype._on_add = function(x, cell) {
  if (this._facet) cell.ds._input.add.push(x);
};

prototype._on_rem = function(x, cell) {
  if (this._facet) cell.ds._input.rem.push(x);
};

prototype._on_mod = function(x, prev, cell0, cell1) {
  if (this._facet) { // Propagate tuples
    if (cell0 === cell1) {
      cell0.ds._input.mod.push(x);
    } else {
      cell0.ds._input.rem.push(x);
      cell1.ds._input.add.push(x);
    }
  }
};

prototype._on_drop = function(cell) {
  if (this._facet) cell.disconnect(this._facet);
};

prototype._on_keep = function(cell) {
  // propagate sort, signals, fields, etc.
  if (this._facet) df.ChangeSet.copy(this._input, cell.ds._input);
};

module.exports = Facetor;


/***/ }),

/***/ "RA6T":
/***/ (function(module, exports) {

// open editor url in a new window, and pass a message
module.exports = function(window, url, data) {
  var editor = window.open(url),
      wait = 10000,
      step = 250,
      count = ~~(wait/step);

  function listen(evt) {
    if (evt.source === editor) {
      count = 0;
      window.removeEventListener('message', listen, false);
    }
  }
  window.addEventListener('message', listen, false);

  // send message
  // periodically resend until ack received or timeout
  function send() {
    if (count <= 0) return;
    editor.postMessage(data, '*');
    setTimeout(send, step);
    count -= 1;
  }
  setTimeout(send, step);
};


/***/ }),

/***/ "RdYp":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Bin(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    field: {type: 'field'},
    min: {type: 'value'},
    max: {type: 'value'},
    base: {type: 'value', default: 10},
    maxbins: {type: 'value', default: 20},
    step: {type: 'value'},
    steps: {type: 'value'},
    minstep: {type: 'value'},
    div: {type: 'array<value>', default: [5, 2]}
  });

  this._output = {
    start: 'bin_start',
    end:   'bin_end',
    mid:   'bin_mid'
  };
  return this.mutates(true);
}

var prototype = (Bin.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Bin;

prototype.extent = function(data) {
  // TODO only recompute extent upon data or field change?
  var e = [this.param('min'), this.param('max')], d;
  if (e[0] == null || e[1] == null) {
    d = dl.extent(data, this.param('field').accessor);
    if (e[0] == null) e[0] = d[0];
    if (e[1] == null) e[1] = d[1];
  }
  return e;
};

prototype.batchTransform = function(input, data) {
  log.debug(input, ['binning']);

  var extent  = this.extent(data),
      output  = this._output,
      step    = this.param('step'),
      steps   = this.param('steps'),
      minstep = this.param('minstep'),
      get     = this.param('field').accessor,
      opt = {
        min: extent[0],
        max: extent[1],
        base: this.param('base'),
        maxbins: this.param('maxbins'),
        div: this.param('div')
      };

  if (step) opt.step = step;
  if (steps) opt.steps = steps;
  if (minstep) opt.minstep = minstep;
  var b = dl.bins(opt),
      s = b.step;

  function update(d) {
    var v = get(d);
    v = v == null ? null
      : b.start + s * ~~((v - b.start) / s);
    Tuple.set(d, output.start, v);
    Tuple.set(d, output.end, v + s);
    Tuple.set(d, output.mid, v + s/2);
  }
  input.add.forEach(update);
  input.mod.forEach(update);
  input.rem.forEach(update);

  input.fields[output.start] = 1;
  input.fields[output.end] = 1;
  input.fields[output.mid] = 1;
  return input;
};

module.exports = Bin;

Bin.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Bin transform",
  "description": "Bins values into quantitative bins (e.g., for a histogram).",
  "type": "object",
  "properties": {
    "type": {"enum": ["bin"]},
    "field": {
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "description": "The name of the field to bin values from."
    },
    "min": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "The minimum bin value to consider."
    },
    "max": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "The maximum bin value to consider."
    },
    "base": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "The number base to use for automatic bin determination.",
      "default": 10
    },
    "maxbins": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "The maximum number of allowable bins.",
      "default": 20
    },
    "step": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "An exact step size to use between bins. If provided, options such as maxbins will be ignored."
    },
    "steps": {
      "description": "An array of allowable step sizes to choose from.",
      "oneOf": [
        {
          "type": "array",
          "items": {"type": "number"}
        },
        {"$ref": "#/refs/signal"}
      ]
    },
    "minstep": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "A minimum allowable step size (particularly useful for integer values)."
    },
    "div": {
      "description": "An array of scale factors indicating allowable subdivisions.",
      "oneOf": [
        {
          "type": "array",
          "items": {"type": "number"},
          "default": [5, 2]
        },
        {"$ref": "#/refs/signal"}
      ]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "start": {"type": "string", "default": "bin_start"},
        "end": {"type": "string", "default": "bin_end"},
        "mid": {"type": "string", "default": "bin_mid"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type", "field"]
};


/***/ }),

/***/ "S/OH":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    expr = __webpack_require__("TrdW"),
    SIGNALS = __webpack_require__("Hqva").Dependencies.SIGNALS;

var RESERVED = ['datum', 'event', 'signals', 'width', 'height', 'padding']
    .concat(dl.keys(expr.codegen.functions));

function parseSignals(model, spec) {
  // process each signal definition
  (spec || []).forEach(function(s) {
    if (RESERVED.indexOf(s.name) !== -1) {
      throw Error('Signal name "'+s.name+'" is a '+
        'reserved keyword ('+RESERVED.join(', ')+').');
    }

    var signal = model.signal(s.name, s.init)
      .verbose(s.verbose);

    if (s.init && s.init.expr) {
      s.init.expr = model.expr(s.init.expr);
      signal.value(exprVal(model, s.init));
    }

    if (s.expr) {
      s.expr = model.expr(s.expr);
      signal.evaluate = function(input) {
        var val = exprVal(model, s),
            sg  = input.signals;
        if (val !== signal.value() || signal.verbose()) {
          signal.value(val);
          sg[s.name] = 1;
        }
        return sg[s.name] ? input : model.doNotPropagate;
      };
      signal.dependency(SIGNALS, s.expr.globals);
      s.expr.globals.forEach(function(dep) {
        model.signal(dep).addListener(signal);
      });
    }
  });

  return spec;
}

function exprVal(model, spec) {
  var e = spec.expr, v = e.fn();
  return spec.scale ? parseSignals.scale(model, spec, v) : v;
}

parseSignals.scale = function scale(model, spec, value, datum, evt) {
  var def = spec.scale,
      name  = def.name || def.signal || def,
      scope = def.scope, e;

  if (scope) {
    if (scope.signal) {
      scope = model.signalRef(scope.signal);
    } else if (dl.isString(scope)) { // Scope is an expression
      e = def._expr = (def._expr || model.expr(scope));
      scope = e.fn(datum, evt);
    }
  }

  return expr.scale(model, def.invert, name, value, scope);
};

module.exports = parseSignals;
parseSignals.schema = {
  "refs": {
    "signal": {
      "title": "SignalRef",
      "type": "object",
      "properties": {"signal": {"type": "string"}},
      "required": ["signal"]
    },

    "scopedScale": {
      "oneOf": [
        {"type": "string"},
        {
          "type": "object",
          "properties": {
            "name": {
              "oneOf": [{"$ref": "#/refs/signal"}, {"type": "string"}]
            },
            "scope": {
              "oneOf": [
                {"$ref": "#/refs/signal"},
                {"type": "string"}
              ]
            },
            "invert": {"type": "boolean", "default": false}
          },

          "additionalProperties": false,
          "required": ["name"]
        }
      ]
    }
  },

  "defs": {
    "signal": {
      "type": "object",

      "properties": {
        "name": {
          "type": "string",
          "not": {"enum": RESERVED}
        },
        "init": {},
        "verbose": {"type": "boolean", "default": false},
        "expr": {"type": "string"},
        "scale": {"$ref": "#/refs/scopedScale"},
        "streams": {"$ref": "#/defs/streams"}
      },

      "additionalProperties": false,
      "required": ["name"]
    }
  }
};


/***/ }),

/***/ "SAbC":
/***/ (function(module, exports, __webpack_require__) {

(function (global, factory) {
   true ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.d3_dsv = {})));
}(this, function (exports) { 'use strict';

  function dsv(delimiter) {
    return new Dsv(delimiter);
  }

  function objectConverter(columns) {
    return new Function("d", "return {" + columns.map(function(name, i) {
      return JSON.stringify(name) + ": d[" + i + "]";
    }).join(",") + "}");
  }

  function customConverter(columns, f) {
    var object = objectConverter(columns);
    return function(row, i) {
      return f(object(row), i, columns);
    };
  }

  // Compute unique columns in order of discovery.
  function inferColumns(rows) {
    var columnSet = Object.create(null),
        columns = [];

    rows.forEach(function(row) {
      for (var column in row) {
        if (!(column in columnSet)) {
          columns.push(columnSet[column] = column);
        }
      }
    });

    return columns;
  }

  function Dsv(delimiter) {
    var reFormat = new RegExp("[\"" + delimiter + "\n]"),
        delimiterCode = delimiter.charCodeAt(0);

    this.parse = function(text, f) {
      var convert, columns, rows = this.parseRows(text, function(row, i) {
        if (convert) return convert(row, i - 1);
        columns = row, convert = f ? customConverter(row, f) : objectConverter(row);
      });
      rows.columns = columns;
      return rows;
    };

    this.parseRows = function(text, f) {
      var EOL = {}, // sentinel value for end-of-line
          EOF = {}, // sentinel value for end-of-file
          rows = [], // output rows
          N = text.length,
          I = 0, // current character index
          n = 0, // the current line number
          t, // the current token
          eol; // is the current token followed by EOL?

      function token() {
        if (I >= N) return EOF; // special case: end of file
        if (eol) return eol = false, EOL; // special case: end of line

        // special case: quotes
        var j = I, c;
        if (text.charCodeAt(j) === 34) {
          var i = j;
          while (i++ < N) {
            if (text.charCodeAt(i) === 34) {
              if (text.charCodeAt(i + 1) !== 34) break;
              ++i;
            }
          }
          I = i + 2;
          c = text.charCodeAt(i + 1);
          if (c === 13) {
            eol = true;
            if (text.charCodeAt(i + 2) === 10) ++I;
          } else if (c === 10) {
            eol = true;
          }
          return text.slice(j + 1, i).replace(/""/g, "\"");
        }

        // common case: find next delimiter or newline
        while (I < N) {
          var k = 1;
          c = text.charCodeAt(I++);
          if (c === 10) eol = true; // \n
          else if (c === 13) { eol = true; if (text.charCodeAt(I) === 10) ++I, ++k; } // \r|\r\n
          else if (c !== delimiterCode) continue;
          return text.slice(j, I - k);
        }

        // special case: last token before EOF
        return text.slice(j);
      }

      while ((t = token()) !== EOF) {
        var a = [];
        while (t !== EOL && t !== EOF) {
          a.push(t);
          t = token();
        }
        if (f && (a = f(a, n++)) == null) continue;
        rows.push(a);
      }

      return rows;
    }

    this.format = function(rows, columns) {
      if (columns == null) columns = inferColumns(rows);
      return [columns.map(formatValue).join(delimiter)].concat(rows.map(function(row) {
        return columns.map(function(column) {
          return formatValue(row[column]);
        }).join(delimiter);
      })).join("\n");
    };

    this.formatRows = function(rows) {
      return rows.map(formatRow).join("\n");
    };

    function formatRow(row) {
      return row.map(formatValue).join(delimiter);
    }

    function formatValue(text) {
      return reFormat.test(text) ? "\"" + text.replace(/\"/g, "\"\"") + "\"" : text;
    }
  }

  dsv.prototype = Dsv.prototype;

  var csv = dsv(",");
  var tsv = dsv("\t");

  var version = "0.1.14";

  exports.version = version;
  exports.dsv = dsv;
  exports.csv = csv;
  exports.tsv = tsv;

}));

/***/ }),

/***/ "SIx5":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var common_1 = __webpack_require__("MtYt");
var bar;
(function (bar) {
    function markType() {
        return 'rect';
    }
    bar.markType = markType;
    function properties(model) {
        var p = {};
        var orient = model.config().mark.orient;
        var stack = model.stack();
        var xFieldDef = model.encoding().x;
        var x2FieldDef = model.encoding().x2;
        var xIsMeasure = fielddef_1.isMeasure(xFieldDef) || fielddef_1.isMeasure(x2FieldDef);
        if (stack && channel_1.X === stack.fieldChannel) {
            p.x = {
                scale: model.scaleName(channel_1.X),
                field: model.field(channel_1.X, { suffix: '_start' })
            };
            p.x2 = {
                scale: model.scaleName(channel_1.X),
                field: model.field(channel_1.X, { suffix: '_end' })
            };
        }
        else if (xIsMeasure) {
            if (orient === 'horizontal') {
                if (model.has(channel_1.X)) {
                    p.x = {
                        scale: model.scaleName(channel_1.X),
                        field: model.field(channel_1.X)
                    };
                }
                else {
                    p.x = {
                        scale: model.scaleName(channel_1.X),
                        value: 0
                    };
                }
                if (model.has(channel_1.X2)) {
                    p.x2 = {
                        scale: model.scaleName(channel_1.X),
                        field: model.field(channel_1.X2)
                    };
                }
                else {
                    p.x2 = {
                        scale: model.scaleName(channel_1.X),
                        value: 0
                    };
                }
            }
            else {
                p.xc = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X)
                };
                p.width = { value: sizeValue(model, channel_1.X) };
            }
        }
        else if (model.fieldDef(channel_1.X).bin) {
            if (model.has(channel_1.SIZE) && orient !== 'horizontal') {
                p.xc = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X, { binSuffix: '_mid' })
                };
                p.width = {
                    scale: model.scaleName(channel_1.SIZE),
                    field: model.field(channel_1.SIZE)
                };
            }
            else {
                p.x = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X, { binSuffix: '_start' }),
                    offset: 1
                };
                p.x2 = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X, { binSuffix: '_end' })
                };
            }
        }
        else {
            if (model.has(channel_1.X)) {
                p.xc = {
                    scale: model.scaleName(channel_1.X),
                    field: model.field(channel_1.X)
                };
            }
            else {
                p.x = { value: 0, offset: 2 };
            }
            p.width = model.has(channel_1.SIZE) && orient !== 'horizontal' ? {
                scale: model.scaleName(channel_1.SIZE),
                field: model.field(channel_1.SIZE)
            } : {
                value: sizeValue(model, (channel_1.X))
            };
        }
        var yFieldDef = model.encoding().y;
        var y2FieldDef = model.encoding().y2;
        var yIsMeasure = fielddef_1.isMeasure(yFieldDef) || fielddef_1.isMeasure(y2FieldDef);
        if (stack && channel_1.Y === stack.fieldChannel) {
            p.y = {
                scale: model.scaleName(channel_1.Y),
                field: model.field(channel_1.Y, { suffix: '_start' })
            };
            p.y2 = {
                scale: model.scaleName(channel_1.Y),
                field: model.field(channel_1.Y, { suffix: '_end' })
            };
        }
        else if (yIsMeasure) {
            if (orient !== 'horizontal') {
                if (model.has(channel_1.Y)) {
                    p.y = {
                        scale: model.scaleName(channel_1.Y),
                        field: model.field(channel_1.Y)
                    };
                }
                else {
                    p.y = {
                        scale: model.scaleName(channel_1.Y),
                        value: 0
                    };
                }
                if (model.has(channel_1.Y2)) {
                    p.y2 = {
                        scale: model.scaleName(channel_1.Y),
                        field: model.field(channel_1.Y2)
                    };
                }
                else {
                    p.y2 = {
                        scale: model.scaleName(channel_1.Y),
                        value: 0
                    };
                }
            }
            else {
                p.yc = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y)
                };
                p.height = { value: sizeValue(model, channel_1.Y) };
            }
        }
        else if (model.fieldDef(channel_1.Y).bin) {
            if (model.has(channel_1.SIZE) && orient === 'horizontal') {
                p.yc = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y, { binSuffix: '_mid' })
                };
                p.height = {
                    scale: model.scaleName(channel_1.SIZE),
                    field: model.field(channel_1.SIZE)
                };
            }
            else {
                p.y = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y, { binSuffix: '_start' })
                };
                p.y2 = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y, { binSuffix: '_end' }),
                    offset: 1
                };
            }
        }
        else {
            if (model.has(channel_1.Y)) {
                p.yc = {
                    scale: model.scaleName(channel_1.Y),
                    field: model.field(channel_1.Y)
                };
            }
            else {
                p.y2 = {
                    field: { group: 'height' },
                    offset: -1
                };
            }
            p.height = model.has(channel_1.SIZE) && orient === 'horizontal' ? {
                scale: model.scaleName(channel_1.SIZE),
                field: model.field(channel_1.SIZE)
            } : {
                value: sizeValue(model, channel_1.Y)
            };
        }
        common_1.applyColorAndOpacity(p, model);
        return p;
    }
    bar.properties = properties;
    function sizeValue(model, channel) {
        var fieldDef = model.fieldDef(channel_1.SIZE);
        if (fieldDef && fieldDef.value !== undefined) {
            return fieldDef.value;
        }
        var markConfig = model.config().mark;
        if (markConfig.barSize) {
            return markConfig.barSize;
        }
        return model.isOrdinalScale(channel) ?
            model.scale(channel).bandSize - 1 :
            !model.has(channel) ?
                model.config().scale.bandSize - 1 :
                markConfig.barThinSize;
    }
    function labels(model) {
        return undefined;
    }
    bar.labels = labels;
})(bar = exports.bar || (exports.bar = {}));
//# sourceMappingURL=bar.js.map

/***/ }),

/***/ "SbOu":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    parseProperties = __webpack_require__("h36N");

function parseMark(model, mark, applyDefaults) {
  var props = mark.properties || (applyDefaults && (mark.properties = {})),
      enter = props.enter || (applyDefaults && (props.enter = {})),
      group = mark.marks,
      config = model.config().marks || {};

  if (applyDefaults) {
    // for scatter plots, set symbol size specified in config if not in spec
    if (mark.type === 'symbol' && !enter.size && config.symbolSize) {
        enter.size = {value: config.symbolSize};
    }

    // Themes define a default "color" that maps to fill/stroke based on mark type.
    var colorMap = {
      arc: 'fill', area: 'fill', rect: 'fill', symbol: 'fill', text: 'fill',
      line: 'stroke', path: 'stroke', rule: 'stroke'
    };

    // Set default mark color if no color is given in spec, and only do so for
    // user-defined marks (not axis/legend marks).
    var colorProp = colorMap[mark.type];
    if (!enter[colorProp] && config.color) {
      enter[colorProp] = {value: config.color};
    }
  }

  // parse mark property definitions
  dl.keys(props).forEach(function(k) {
    props[k] = parseProperties(model, mark.type, props[k]);
  });

  // parse delay function
  if (mark.delay) {
    mark.delay = parseProperties(model, mark.type, {delay: mark.delay});
  }

  // recurse if group type
  if (group) {
    mark.marks = group.map(function(g) { return parseMark(model, g, true); });
  }

  return mark;
}

module.exports = parseMark;

parseMark.schema = {
  "defs": {
    "mark": {
      "type": "object",

      "properties": {
        "name": {"type": "string"},
        "key": {"type": "string"},
        "type": {"enum": ["rect", "symbol", "path", "arc",
          "area", "line", "rule", "image", "text", "group"]},

        "from": {
          "type": "object",
          "properties": {
            "data": {"type": "string"},
            "mark": {"type": "string"},
            "transform": {"$ref": "#/defs/transform"}
          },
          "additionalProperties": false
        },

        "delay": {"$ref": "#/refs/numberValue"},
        "ease": {
          "enum": ["linear", "quad", "cubic", "sin",
            "exp", "circle", "bounce"].reduce(function(acc, e) {
              ["in", "out", "in-out", "out-in"].forEach(function(m) {
                acc.push(e+"-"+m);
              });
              return acc;
          }, [])
        },

        "interactive": {"type": "boolean"},

        "properties": {
          "type": "object",
          "properties": {
            "enter":  {"$ref": "#/defs/propset"},
            "update": {"$ref": "#/defs/propset"},
            "exit":   {"$ref": "#/defs/propset"},
            "hover":  {"$ref": "#/defs/propset"}
          },
          "additionalProperties": false,
          "anyOf": [{"required": ["enter"]}, {"required": ["update"]}]
        }
      },

      // "additionalProperties": false,
      "required": ["type"]
    }
  }
};


/***/ }),

/***/ "Sgrz":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Hierarchy(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    // hierarchy parameters
    sort: {type: 'array<field>', default: null},
    children: {type: 'field', default: 'children'},
    parent: {type: 'field', default: 'parent'},
    field: {type: 'value', default: null},
    // layout parameters
    mode: {type: 'value', default: 'tidy'}, // tidy, cluster, partition
    size: {type: 'array<value>', default: __webpack_require__("MRce").size},
    nodesize: {type: 'array<value>', default: null},
    orient: {type: 'value', default: 'cartesian'}
  });

  this._mode = null;
  this._output = {
    'x':      'layout_x',
    'y':      'layout_y',
    'width':  'layout_width',
    'height': 'layout_height',
    'depth':  'layout_depth'
  };
  return this.mutates(true);
}

var PARTITION = 'partition';

var SEPARATION = {
  cartesian: function(a, b) { return (a.parent === b.parent ? 1 : 2); },
  radial: function(a, b) { return (a.parent === b.parent ? 1 : 2) / a.depth; }
};

var prototype = (Hierarchy.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Hierarchy;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['hierarchy layout']);

  // get variables
  var layout = this._layout,
      output = this._output,
      mode   = this.param('mode'),
      sort   = this.param('sort'),
      nodesz = this.param('nodesize'),
      parent = this.param('parent').accessor,
      root = data.filter(function(d) { return parent(d) === null; })[0];

  if (mode !== this._mode) {
    this._mode = mode;
    if (mode === 'tidy') mode = 'tree';
    layout = (this._layout = d3.layout[mode]());
  }

  input.fields[output.x] = 1;
  input.fields[output.y] = 1;
  input.fields[output.depth] = 1;
  if (mode === PARTITION) {
    input.fields[output.width] = 1;
    input.fields[output.height] = 1;
    layout.value(this.param('field').accessor);
  } else {
    layout.separation(SEPARATION[this.param('orient')]);
  }

  if (nodesz.length && mode !== PARTITION) {
    layout.nodeSize(nodesz);
  } else {
    layout.size(this.param('size'));
  }

  layout
    .sort(sort.field.length ? dl.comparator(sort.field) : null)
    .children(this.param('children').accessor)
    .nodes(root);

  // copy layout values to nodes
  data.forEach(function(n) {
    Tuple.set(n, output.x, n.x);
    Tuple.set(n, output.y, n.y);
    Tuple.set(n, output.depth, n.depth);
    if (mode === PARTITION) {
      Tuple.set(n, output.width, n.dx);
      Tuple.set(n, output.height, n.dy);
    }
  });

  // return changeset
  return input;
};

module.exports = Hierarchy;

Hierarchy.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Hierarchy transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["hierarchy"]},
    "sort": {
      "description": "A list of fields to use as sort criteria for sibling nodes.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ]
    },
    "children": {
      "description": "The data field for the children node array",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "children"
    },
    "parent": {
      "description": "The data field for the parent node",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "parent"
    },
    "field": {
      "description": "The value for the area of each leaf-level node for partition layouts.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "mode": {
      "description": "The layout algorithm mode to use.",
      "oneOf": [
        {"enum": ["tidy", "cluster", "partition"]},
        {"$ref": "#/refs/signal"}
      ],
      "default": "tidy"
    },
    "orient": {
      "description": "The layout orientation to use.",
      "oneOf": [
        {"enum": ["cartesian", "radial"]},
        {"$ref": "#/refs/signal"}
      ],
      "default": "cartesian"
    },
    "size": {
      "description": "The dimensions of the tree layout",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
          "minItems": 2,
          "maxItems": 2
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": [500, 500]
    },
    "nodesize": {
      "description": "Sets a fixed x,y size for each node (overrides the size parameter)",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
          "minItems": 2,
          "maxItems": 2
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": null
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "x": {"type": "string", "default": "layout_x"},
        "y": {"type": "string", "default": "layout_y"},
        "width": {"type": "string", "default": "layout_width"},
        "height": {"type": "string", "default": "layout_height"},
        "depth": {"type": "string", "default": "layout_depth"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "TLMq":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var aggregate_1 = __webpack_require__("h/tW");
var channel_1 = __webpack_require__("P/aK");
var data_1 = __webpack_require__("x6Fv");
var fielddef_1 = __webpack_require__("o+e1");
var mark_1 = __webpack_require__("j8cM");
var scale_1 = __webpack_require__("Fw/k");
var stack_1 = __webpack_require__("f2i1");
var timeunit_1 = __webpack_require__("z5TJ");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var time_1 = __webpack_require__("wKIX");
exports.COLOR_LEGEND = 'color_legend';
exports.COLOR_LEGEND_LABEL = 'color_legend_label';
function parseScaleComponent(model) {
    return model.channels().reduce(function (scale, channel) {
        if (model.scale(channel)) {
            var fieldDef = model.fieldDef(channel);
            var scales = {
                main: parseMainScale(model, fieldDef, channel)
            };
            if (channel === channel_1.COLOR && model.legend(channel_1.COLOR) && (fieldDef.type === type_1.ORDINAL || fieldDef.bin || fieldDef.timeUnit)) {
                scales.colorLegend = parseColorLegendScale(model, fieldDef);
                if (fieldDef.bin) {
                    scales.binColorLegend = parseBinColorLegendLabel(model, fieldDef);
                }
            }
            scale[channel] = scales;
        }
        return scale;
    }, {});
}
exports.parseScaleComponent = parseScaleComponent;
function parseMainScale(model, fieldDef, channel) {
    var scale = model.scale(channel);
    var sort = model.sort(channel);
    var scaleDef = {
        name: model.scaleName(channel),
        type: scale.type,
    };
    if (channel === channel_1.X && model.has(channel_1.X2)) {
        if (model.has(channel_1.X)) {
            scaleDef.domain = { fields: [domain(scale, model, channel_1.X), domain(scale, model, channel_1.X2)] };
        }
        else {
            scaleDef.domain = domain(scale, model, channel_1.X2);
        }
    }
    else if (channel === channel_1.Y && model.has(channel_1.Y2)) {
        if (model.has(channel_1.Y)) {
            scaleDef.domain = { fields: [domain(scale, model, channel_1.Y), domain(scale, model, channel_1.Y2)] };
        }
        else {
            scaleDef.domain = domain(scale, model, channel_1.Y2);
        }
    }
    else {
        scaleDef.domain = domain(scale, model, channel);
    }
    util_1.extend(scaleDef, rangeMixins(scale, model, channel));
    if (sort && (typeof sort === 'string' ? sort : sort.order) === 'descending') {
        scaleDef.reverse = true;
    }
    [
        'round',
        'clamp', 'nice',
        'exponent', 'zero',
        'padding', 'points'
    ].forEach(function (property) {
        var value = exports[property](scale, channel, fieldDef, model);
        if (value !== undefined) {
            scaleDef[property] = value;
        }
    });
    return scaleDef;
}
function parseColorLegendScale(model, fieldDef) {
    return {
        name: model.scaleName(exports.COLOR_LEGEND),
        type: scale_1.ScaleType.ORDINAL,
        domain: {
            data: model.dataTable(),
            field: model.field(channel_1.COLOR, (fieldDef.bin || fieldDef.timeUnit) ? {} : { prefn: 'rank_' }),
            sort: true
        },
        range: { data: model.dataTable(), field: model.field(channel_1.COLOR), sort: true }
    };
}
function parseBinColorLegendLabel(model, fieldDef) {
    return {
        name: model.scaleName(exports.COLOR_LEGEND_LABEL),
        type: scale_1.ScaleType.ORDINAL,
        domain: {
            data: model.dataTable(),
            field: model.field(channel_1.COLOR),
            sort: true
        },
        range: {
            data: model.dataTable(),
            field: fielddef_1.field(fieldDef, { binSuffix: '_range' }),
            sort: {
                field: model.field(channel_1.COLOR, { binSuffix: '_start' }),
                op: 'min'
            }
        }
    };
}
function scaleType(scale, fieldDef, channel, mark) {
    if (!channel_1.hasScale(channel)) {
        return null;
    }
    if (util_1.contains([channel_1.ROW, channel_1.COLUMN, channel_1.SHAPE], channel)) {
        return scale_1.ScaleType.ORDINAL;
    }
    if (scale.type !== undefined) {
        return scale.type;
    }
    switch (fieldDef.type) {
        case type_1.NOMINAL:
            return scale_1.ScaleType.ORDINAL;
        case type_1.ORDINAL:
            if (channel === channel_1.COLOR) {
                return scale_1.ScaleType.LINEAR;
            }
            return scale_1.ScaleType.ORDINAL;
        case type_1.TEMPORAL:
            if (channel === channel_1.COLOR) {
                return scale_1.ScaleType.TIME;
            }
            if (fieldDef.timeUnit) {
                switch (fieldDef.timeUnit) {
                    case timeunit_1.TimeUnit.HOURS:
                    case timeunit_1.TimeUnit.DAY:
                    case timeunit_1.TimeUnit.MONTH:
                    case timeunit_1.TimeUnit.QUARTER:
                        return scale_1.ScaleType.ORDINAL;
                    default:
                        return scale_1.ScaleType.TIME;
                }
            }
            return scale_1.ScaleType.TIME;
        case type_1.QUANTITATIVE:
            if (fieldDef.bin) {
                return util_1.contains([channel_1.X, channel_1.Y, channel_1.COLOR], channel) ? scale_1.ScaleType.LINEAR : scale_1.ScaleType.ORDINAL;
            }
            return scale_1.ScaleType.LINEAR;
    }
    return null;
}
exports.scaleType = scaleType;
function domain(scale, model, channel) {
    var fieldDef = model.fieldDef(channel);
    if (scale.domain) {
        return scale.domain;
    }
    if (fieldDef.type === type_1.TEMPORAL) {
        if (time_1.rawDomain(fieldDef.timeUnit, channel)) {
            return {
                data: fieldDef.timeUnit,
                field: 'date'
            };
        }
        return {
            data: model.dataTable(),
            field: model.field(channel),
            sort: {
                field: model.field(channel),
                op: 'min'
            }
        };
    }
    var stack = model.stack();
    if (stack && channel === stack.fieldChannel) {
        if (stack.offset === stack_1.StackOffset.NORMALIZE) {
            return [0, 1];
        }
        return {
            data: model.dataName(data_1.STACKED_SCALE),
            field: model.field(channel, { prefn: 'sum_' })
        };
    }
    var useRawDomain = _useRawDomain(scale, model, channel), sort = domainSort(model, channel, scale.type);
    if (useRawDomain) {
        return {
            data: data_1.SOURCE,
            field: model.field(channel, { noAggregate: true })
        };
    }
    else if (fieldDef.bin) {
        if (scale.type === scale_1.ScaleType.ORDINAL) {
            return {
                data: model.dataTable(),
                field: model.field(channel, { binSuffix: '_range' }),
                sort: {
                    field: model.field(channel, { binSuffix: '_start' }),
                    op: 'min'
                }
            };
        }
        else if (channel === channel_1.COLOR) {
            return {
                data: model.dataTable(),
                field: model.field(channel, { binSuffix: '_start' })
            };
        }
        else {
            return {
                data: model.dataTable(),
                field: [
                    model.field(channel, { binSuffix: '_start' }),
                    model.field(channel, { binSuffix: '_end' })
                ]
            };
        }
    }
    else if (sort) {
        return {
            data: sort.op ? data_1.SOURCE : model.dataTable(),
            field: (fieldDef.type === type_1.ORDINAL && channel === channel_1.COLOR) ? model.field(channel, { prefn: 'rank_' }) : model.field(channel),
            sort: sort
        };
    }
    else {
        return {
            data: model.dataTable(),
            field: (fieldDef.type === type_1.ORDINAL && channel === channel_1.COLOR) ? model.field(channel, { prefn: 'rank_' }) : model.field(channel),
        };
    }
}
exports.domain = domain;
function domainSort(model, channel, scaleType) {
    if (scaleType !== scale_1.ScaleType.ORDINAL) {
        return undefined;
    }
    var sort = model.sort(channel);
    if (util_1.contains(['ascending', 'descending', undefined], sort)) {
        return true;
    }
    if (typeof sort !== 'string') {
        return {
            op: sort.op,
            field: sort.field
        };
    }
    return undefined;
}
exports.domainSort = domainSort;
function _useRawDomain(scale, model, channel) {
    var fieldDef = model.fieldDef(channel);
    return scale.useRawDomain &&
        fieldDef.aggregate &&
        aggregate_1.SHARED_DOMAIN_OPS.indexOf(fieldDef.aggregate) >= 0 &&
        ((fieldDef.type === type_1.QUANTITATIVE && !fieldDef.bin) ||
            (fieldDef.type === type_1.TEMPORAL && util_1.contains([scale_1.ScaleType.TIME, scale_1.ScaleType.UTC], scale.type)));
}
function rangeMixins(scale, model, channel) {
    var fieldDef = model.fieldDef(channel);
    var scaleConfig = model.config().scale;
    if (scale.type === scale_1.ScaleType.ORDINAL && scale.bandSize && util_1.contains([channel_1.X, channel_1.Y], channel)) {
        return { bandSize: scale.bandSize };
    }
    if (scale.range && !util_1.contains([channel_1.X, channel_1.Y, channel_1.ROW, channel_1.COLUMN], channel)) {
        return { range: scale.range };
    }
    switch (channel) {
        case channel_1.ROW:
            return { range: 'height' };
        case channel_1.COLUMN:
            return { range: 'width' };
    }
    var unitModel = model;
    switch (channel) {
        case channel_1.X:
            return {
                rangeMin: 0,
                rangeMax: unitModel.config().cell.width
            };
        case channel_1.Y:
            return {
                rangeMin: unitModel.config().cell.height,
                rangeMax: 0
            };
        case channel_1.SIZE:
            if (unitModel.mark() === mark_1.BAR) {
                if (scaleConfig.barSizeRange !== undefined) {
                    return { range: scaleConfig.barSizeRange };
                }
                var dimension = model.config().mark.orient === 'horizontal' ? channel_1.Y : channel_1.X;
                return { range: [model.config().mark.barThinSize, model.scale(dimension).bandSize] };
            }
            else if (unitModel.mark() === mark_1.TEXT) {
                return { range: scaleConfig.fontSizeRange };
            }
            else if (unitModel.mark() === mark_1.RULE) {
                return { range: scaleConfig.ruleSizeRange };
            }
            else if (unitModel.mark() === mark_1.TICK) {
                return { range: scaleConfig.tickSizeRange };
            }
            if (scaleConfig.pointSizeRange !== undefined) {
                return { range: scaleConfig.pointSizeRange };
            }
            var bandSize = pointBandSize(unitModel);
            return { range: [9, (bandSize - 2) * (bandSize - 2)] };
        case channel_1.SHAPE:
            return { range: scaleConfig.shapeRange };
        case channel_1.COLOR:
            if (fieldDef.type === type_1.NOMINAL) {
                return { range: scaleConfig.nominalColorRange };
            }
            return { range: scaleConfig.sequentialColorRange };
        case channel_1.OPACITY:
            return { range: scaleConfig.opacity };
    }
    return {};
}
exports.rangeMixins = rangeMixins;
function pointBandSize(model) {
    var scaleConfig = model.config().scale;
    var hasX = model.has(channel_1.X);
    var hasY = model.has(channel_1.Y);
    var xIsMeasure = fielddef_1.isMeasure(model.encoding().x);
    var yIsMeasure = fielddef_1.isMeasure(model.encoding().y);
    if (hasX && hasY) {
        return xIsMeasure !== yIsMeasure ?
            model.scale(xIsMeasure ? channel_1.Y : channel_1.X).bandSize :
            Math.min(model.scale(channel_1.X).bandSize || scaleConfig.bandSize, model.scale(channel_1.Y).bandSize || scaleConfig.bandSize);
    }
    else if (hasY) {
        return yIsMeasure ? model.config().scale.bandSize : model.scale(channel_1.Y).bandSize;
    }
    else if (hasX) {
        return xIsMeasure ? model.config().scale.bandSize : model.scale(channel_1.X).bandSize;
    }
    return model.config().scale.bandSize;
}
function clamp(scale) {
    if (util_1.contains([scale_1.ScaleType.LINEAR, scale_1.ScaleType.POW, scale_1.ScaleType.SQRT,
        scale_1.ScaleType.LOG, scale_1.ScaleType.TIME, scale_1.ScaleType.UTC], scale.type)) {
        return scale.clamp;
    }
    return undefined;
}
exports.clamp = clamp;
function exponent(scale) {
    if (scale.type === scale_1.ScaleType.POW) {
        return scale.exponent;
    }
    return undefined;
}
exports.exponent = exponent;
function nice(scale, channel, fieldDef) {
    if (util_1.contains([scale_1.ScaleType.LINEAR, scale_1.ScaleType.POW, scale_1.ScaleType.SQRT, scale_1.ScaleType.LOG,
        scale_1.ScaleType.TIME, scale_1.ScaleType.UTC, scale_1.ScaleType.QUANTIZE], scale.type)) {
        if (scale.nice !== undefined) {
            return scale.nice;
        }
        if (util_1.contains([scale_1.ScaleType.TIME, scale_1.ScaleType.UTC], scale.type)) {
            return time_1.smallestUnit(fieldDef.timeUnit);
        }
        return util_1.contains([channel_1.X, channel_1.Y], channel);
    }
    return undefined;
}
exports.nice = nice;
function padding(scale, channel) {
    if (scale.type === scale_1.ScaleType.ORDINAL && util_1.contains([channel_1.X, channel_1.Y], channel)) {
        return scale.padding;
    }
    return undefined;
}
exports.padding = padding;
function points(scale, channel, __, model) {
    if (scale.type === scale_1.ScaleType.ORDINAL && util_1.contains([channel_1.X, channel_1.Y], channel)) {
        return true;
    }
    return undefined;
}
exports.points = points;
function round(scale, channel) {
    if (util_1.contains([channel_1.X, channel_1.Y, channel_1.ROW, channel_1.COLUMN, channel_1.SIZE], channel) && scale.round !== undefined) {
        return scale.round;
    }
    return undefined;
}
exports.round = round;
function zero(scale, channel, fieldDef) {
    if (!util_1.contains([scale_1.ScaleType.TIME, scale_1.ScaleType.UTC, scale_1.ScaleType.ORDINAL], scale.type)) {
        if (scale.zero !== undefined) {
            return scale.zero;
        }
        return !fieldDef.bin && util_1.contains([channel_1.X, channel_1.Y], channel);
    }
    return undefined;
}
exports.zero = zero;
//# sourceMappingURL=scale.js.map

/***/ }),

/***/ "TXaq":
/***/ (function(module, exports, __webpack_require__) {

var df = __webpack_require__("Hqva"),
    Tuple = df.Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Formula(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    field: {type: 'value'},
    expr:  {type: 'expr'}
  });

  return this.mutates(true);
}

var prototype = (Formula.prototype = Object.create(Transform.prototype));
prototype.constructor = Formula;

prototype.transform = function(input) {
  log.debug(input, ['formulating']);

  var field = this.param('field'),
      expr = this.param('expr'),
      updated = false;

  function set(x) {
    Tuple.set(x, field, expr(x));
    updated = true;
  }

  input.add.forEach(set);

  if (this.reevaluate(input)) {
    input.mod.forEach(set);
  }

  if (updated) input.fields[field] = 1;
  return input;
};

module.exports = Formula;

Formula.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Formula transform",
  "description": "Extends data elements with new values according to a calculation formula.",
  "type": "object",
  "properties": {
    "type": {"enum": ["formula"]},
    "field": {
      "type": "string",
      "description": "The property name in which to store the computed formula value."
    },
    "expr": {
      "type": "string",
      "description": "A string containing an expression (in JavaScript syntax) for the formula."
    }
  },
  "required": ["type", "field", "expr"]
};


/***/ }),

/***/ "TrdW":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    template = dl.template,
    expr = __webpack_require__("jNWb"),
    args = ['datum', 'parent', 'event', 'signals'];

var compile = expr.compiler(args, {
  idWhiteList: args,
  fieldVar:    args[0],
  globalVar:   function(id) {
    return 'this.sig[' + dl.str(id) + ']._value';
  },
  functions:   function(codegen) {
    var fn = expr.functions(codegen);
    fn.eventItem  = 'event.vg.getItem';
    fn.eventGroup = 'event.vg.getGroup';
    fn.eventX     = 'event.vg.getX';
    fn.eventY     = 'event.vg.getY';
    fn.open       = openGen(codegen);
    fn.scale      = scaleGen(codegen, false);
    fn.iscale     = scaleGen(codegen, true);
    fn.inrange    = 'this.defs.inrange';
    fn.indata     = indataGen(codegen);
    fn.format     = 'this.defs.format';
    fn.timeFormat = 'this.defs.timeFormat';
    fn.utcFormat  = 'this.defs.utcFormat';
    return fn;
  },
  functionDefs: function(/*codegen*/) {
    return {
      'scale':      scale,
      'inrange':    inrange,
      'indata':     indata,
      'format':     numberFormat,
      'timeFormat': timeFormat,
      'utcFormat':  utcFormat,
      'open':       windowOpen
    };
  }
});

function openGen(codegen) {
  return function (args) {
    args = args.map(codegen);
    var n = args.length;
    if (n < 1 || n > 2) {
      throw Error("open takes exactly 1 or 2 arguments.");
    }
    return 'this.defs.open(this.model, ' +
      args[0] + (n > 1 ? ',' + args[1] : '') + ')';
  };
}

function windowOpen(model, url, name) {
  if (typeof window !== 'undefined' && window && window.open) {
    var opt = dl.extend({type: 'open', url: url, name: name}, model.config().load),
        uri = dl.load.sanitizeUrl(opt);
    if (uri) {
      window.open(uri, name);
    } else {
      throw Error('Invalid URL: ' + opt.url);
    }
  } else {
    throw Error('Open function can only be invoked in a browser.');
  }
}

function scaleGen(codegen, invert) {
  return function(args) {
    args = args.map(codegen);
    var n = args.length;
    if (n < 2 || n > 3) {
      throw Error("scale takes exactly 2 or 3 arguments.");
    }
    return 'this.defs.scale(this.model, ' + invert + ', ' +
      args[0] + ',' + args[1] + (n > 2 ? ',' + args[2] : '') + ')';
  };
}

function scale(model, invert, name, value, scope) {
  if (!scope || !scope.scale) {
    scope = (scope && scope.mark) ? scope.mark.group : model.scene().items[0];
  }
  // Verify scope is valid
  if (model.group(scope._id) !== scope) {
    throw Error('Scope for scale "'+name+'" is not a valid group item.');
  }
  var s = scope.scale(name);
  return !s ? value : (invert ? s.invert(value) : s(value));
}

function inrange(val, a, b, exclusive) {
  var min = a, max = b;
  if (a > b) { min = b; max = a; }
  return exclusive ?
    (min < val && max > val) :
    (min <= val && max >= val);
}

function indataGen(codegen) {
  return function(args, globals, fields, dataSources) {
    var data;
    if (args.length !== 3) {
      throw Error("indata takes 3 arguments.");
    }
    if (args[0].type !== 'Literal') {
      throw Error("Data source name must be a literal for indata.");
    }

    data = args[0].value;
    dataSources[data] = 1;
    if (args[2].type === 'Literal') {
      indataGen.model.requestIndex(data, args[2].value);
    }

    args = args.map(codegen);
    return 'this.defs.indata(this.model,' +
      args[0] + ',' + args[1] + ',' + args[2] + ')';
  };
}

function indata(model, dataname, val, field) {
  var data = model.data(dataname),
      index = data.getIndex(field);
  return index[val] > 0;
}

function numberFormat(specifier, v) {
  return template.format(specifier, 'number')(v);
}

function timeFormat(specifier, d) {
  return template.format(specifier, 'time')(d);
}

function utcFormat(specifier, d) {
  return template.format(specifier, 'utc')(d);
}

function wrap(model) {
  return function(str) {
    indataGen.model = model;
    var x = compile(str);
    x.model = model;
    x.sig = model ? model._signals : {};
    return x;
  };
}

wrap.scale = scale;
wrap.codegen = compile.codegen;
module.exports = wrap;


/***/ }),

/***/ "UaGl":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  axes:       __webpack_require__("W+IH"),
  background: __webpack_require__("fxxq"),
  data:       __webpack_require__("OTIj"),
  events:     __webpack_require__("XSKZ"),
  expr:       __webpack_require__("TrdW"),
  legends:    __webpack_require__("v4pi"),
  mark:       __webpack_require__("SbOu"),
  marks:      __webpack_require__("92+E"),
  modify:     __webpack_require__("r7he"),
  padding:    __webpack_require__("O3lN"),
  predicates: __webpack_require__("yaQe"),
  properties: __webpack_require__("h36N"),
  signals:    __webpack_require__("S/OH"),
  spec:       __webpack_require__("ybCx"),
  streams:    __webpack_require__("6gf1"),
  transforms: __webpack_require__("DUWk")
};


/***/ }),

/***/ "Uikm":
/***/ (function(module, exports, __webpack_require__) {

var Transform = __webpack_require__("4JPs"),
    Aggregate = __webpack_require__("3Y21");

function Facet(graph) {
  Transform.addParameters(this, {
    transform: {
      type: "custom",
      set: function(pipeline) {
        return (this._transform._pipeline = pipeline, this._transform);
      },
      get: function() {
        var parse = __webpack_require__("DUWk"),
            facet = this._transform;
        return facet._pipeline.map(function(t) {
          return parse(facet._graph, t);
        });
      }
    }
  });

  this._pipeline = [];
  return Aggregate.call(this, graph);
}

var prototype = (Facet.prototype = Object.create(Aggregate.prototype));
prototype.constructor = Facet;

prototype.aggr = function() {
  return Aggregate.prototype.aggr.call(this).facet(this);
};

prototype.transform = function(input, reset) {
  var output  = Aggregate.prototype.transform.call(this, input, reset);

  // New facet cells should trigger a re-ranking of the dataflow graph.
  // This ensures facet datasources are computed before scenegraph nodes.
  // We rerank the Facet's first listener, which is the next node in the
  // datasource's pipeline.
  if (input.add.length) {
    this.listeners()[0].rerank();
  }

  return output;
};

module.exports = Facet;

var dl = __webpack_require__("zicW");

Facet.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Facet transform",
  "description": "A special aggregate transform that organizes a data set into groups or \"facets\".",
  "type": "object",
  "properties": dl.extend({}, Aggregate.schema.properties, {
    "type": {"enum": ["facet"]},
    "transform": {"$ref": "#/defs/transform"}
  }),
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "Utn/":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var mark_1 = __webpack_require__("j8cM");
exports.DEFAULT_REQUIRED_CHANNEL_MAP = {
    text: ['text'],
    line: ['x', 'y'],
    area: ['x', 'y']
};
exports.DEFAULT_SUPPORTED_CHANNEL_TYPE = {
    bar: util_1.toMap(['row', 'column', 'x', 'y', 'size', 'color', 'detail']),
    line: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'detail']),
    area: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'detail']),
    tick: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'detail']),
    circle: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'size', 'detail']),
    square: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'size', 'detail']),
    point: util_1.toMap(['row', 'column', 'x', 'y', 'color', 'size', 'detail', 'shape']),
    text: util_1.toMap(['row', 'column', 'size', 'color', 'text'])
};
function getEncodingMappingError(spec, requiredChannelMap, supportedChannelMap) {
    if (requiredChannelMap === void 0) { requiredChannelMap = exports.DEFAULT_REQUIRED_CHANNEL_MAP; }
    if (supportedChannelMap === void 0) { supportedChannelMap = exports.DEFAULT_SUPPORTED_CHANNEL_TYPE; }
    var mark = spec.mark;
    var encoding = spec.encoding;
    var requiredChannels = requiredChannelMap[mark];
    var supportedChannels = supportedChannelMap[mark];
    for (var i in requiredChannels) {
        if (!(requiredChannels[i] in encoding)) {
            return 'Missing encoding channel \"' + requiredChannels[i] +
                '\" for mark \"' + mark + '\"';
        }
    }
    for (var channel in encoding) {
        if (!supportedChannels[channel]) {
            return 'Encoding channel \"' + channel +
                '\" is not supported by mark type \"' + mark + '\"';
        }
    }
    if (mark === mark_1.BAR && !encoding.x && !encoding.y) {
        return 'Missing both x and y for bar';
    }
    return null;
}
exports.getEncodingMappingError = getEncodingMappingError;
//# sourceMappingURL=validate.js.map

/***/ }),

/***/ "V22v":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var source_1 = __webpack_require__("jMte");
var formatparse_1 = __webpack_require__("hBex");
var nullfilter_1 = __webpack_require__("t3C9");
var filter_1 = __webpack_require__("1PdY");
var bin_1 = __webpack_require__("nOes");
var formula_1 = __webpack_require__("pAWG");
var nonpositivenullfilter_1 = __webpack_require__("yixx");
var summary_1 = __webpack_require__("QNWf");
var stackscale_1 = __webpack_require__("kowr");
var timeunit_1 = __webpack_require__("736r");
var timeunitdomain_1 = __webpack_require__("k66X");
var colorrank_1 = __webpack_require__("vY52");
function parseUnitData(model) {
    return {
        formatParse: formatparse_1.formatParse.parseUnit(model),
        nullFilter: nullfilter_1.nullFilter.parseUnit(model),
        filter: filter_1.filter.parseUnit(model),
        nonPositiveFilter: nonpositivenullfilter_1.nonPositiveFilter.parseUnit(model),
        source: source_1.source.parseUnit(model),
        bin: bin_1.bin.parseUnit(model),
        calculate: formula_1.formula.parseUnit(model),
        timeUnit: timeunit_1.timeUnit.parseUnit(model),
        timeUnitDomain: timeunitdomain_1.timeUnitDomain.parseUnit(model),
        summary: summary_1.summary.parseUnit(model),
        stackScale: stackscale_1.stackScale.parseUnit(model),
        colorRank: colorrank_1.colorRank.parseUnit(model)
    };
}
exports.parseUnitData = parseUnitData;
function parseFacetData(model) {
    return {
        formatParse: formatparse_1.formatParse.parseFacet(model),
        nullFilter: nullfilter_1.nullFilter.parseFacet(model),
        filter: filter_1.filter.parseFacet(model),
        nonPositiveFilter: nonpositivenullfilter_1.nonPositiveFilter.parseFacet(model),
        source: source_1.source.parseFacet(model),
        bin: bin_1.bin.parseFacet(model),
        calculate: formula_1.formula.parseFacet(model),
        timeUnit: timeunit_1.timeUnit.parseFacet(model),
        timeUnitDomain: timeunitdomain_1.timeUnitDomain.parseFacet(model),
        summary: summary_1.summary.parseFacet(model),
        stackScale: stackscale_1.stackScale.parseFacet(model),
        colorRank: colorrank_1.colorRank.parseFacet(model)
    };
}
exports.parseFacetData = parseFacetData;
function parseLayerData(model) {
    return {
        filter: filter_1.filter.parseLayer(model),
        formatParse: formatparse_1.formatParse.parseLayer(model),
        nullFilter: nullfilter_1.nullFilter.parseLayer(model),
        nonPositiveFilter: nonpositivenullfilter_1.nonPositiveFilter.parseLayer(model),
        source: source_1.source.parseLayer(model),
        bin: bin_1.bin.parseLayer(model),
        calculate: formula_1.formula.parseLayer(model),
        timeUnit: timeunit_1.timeUnit.parseLayer(model),
        timeUnitDomain: timeunitdomain_1.timeUnitDomain.parseLayer(model),
        summary: summary_1.summary.parseLayer(model),
        stackScale: stackscale_1.stackScale.parseLayer(model),
        colorRank: colorrank_1.colorRank.parseLayer(model)
    };
}
exports.parseLayerData = parseLayerData;
function assembleData(model, data) {
    var component = model.component.data;
    var sourceData = source_1.source.assemble(model, component);
    if (sourceData) {
        data.push(sourceData);
    }
    summary_1.summary.assemble(component, model).forEach(function (summaryData) {
        data.push(summaryData);
    });
    if (data.length > 0) {
        var dataTable = data[data.length - 1];
        var colorRankTransform = colorrank_1.colorRank.assemble(component);
        if (colorRankTransform.length > 0) {
            dataTable.transform = (dataTable.transform || []).concat(colorRankTransform);
        }
        var nonPositiveFilterTransform = nonpositivenullfilter_1.nonPositiveFilter.assemble(component);
        if (nonPositiveFilterTransform.length > 0) {
            dataTable.transform = (dataTable.transform || []).concat(nonPositiveFilterTransform);
        }
    }
    else {
        if (util_1.keys(component.colorRank).length > 0) {
            throw new Error('Invalid colorRank not merged');
        }
        else if (util_1.keys(component.nonPositiveFilter).length > 0) {
            throw new Error('Invalid nonPositiveFilter not merged');
        }
    }
    var stackData = stackscale_1.stackScale.assemble(component);
    if (stackData) {
        data.push(stackData);
    }
    timeunitdomain_1.timeUnitDomain.assemble(component).forEach(function (timeUnitDomainData) {
        data.push(timeUnitDomainData);
    });
    return data;
}
exports.assembleData = assembleData;
//# sourceMappingURL=data.js.map

/***/ }),

/***/ "VeBo":
/***/ (function(module, exports) {

function Handler() {
  this._active = null;
  this._handlers = {};
}

var prototype = Handler.prototype;

prototype.initialize = function(el, pad, obj) {
  this._el = el;
  this._obj = obj || null;
  return this.padding(pad);
};

prototype.element = function() {
  return this._el;
};

prototype.padding = function(pad) {
  this._padding = pad || {top:0, left:0, bottom:0, right:0};
  return this;
};

prototype.scene = function(scene) {
  if (!arguments.length) return this._scene;
  this._scene = scene;
  return this;
};

// add an event handler
// subclasses should override
prototype.on = function(/*type, handler*/) {};

// remove an event handler
// subclasses should override
prototype.off = function(/*type, handler*/) {};

// return an array with all registered event handlers
prototype.handlers = function() {
  var h = this._handlers, a = [], k;
  for (k in h) { a.push.apply(a, h[k]); }
  return a;
};

prototype.eventName = function(name) {
  var i = name.indexOf('.');
  return i < 0 ? name : name.slice(0,i);
};

module.exports = Handler;

/***/ }),

/***/ "Vp7n":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    Item = __webpack_require__("LHV8").Item,
    df = __webpack_require__("Hqva"),
    Node = df.Node, // jshint ignore:line
    Deps = df.Dependencies,
    Tuple = df.Tuple,
    ChangeSet = df.ChangeSet,
    Sentinel = {},
    Encoder  = __webpack_require__("XVii"),
    Bounder  = __webpack_require__("rnWk"),
    parseData = __webpack_require__("OTIj");

function Builder() {
  return arguments.length ? this.init.apply(this, arguments) : this;
}

var Status = Builder.STATUS = {
  ENTER:  'enter',
  UPDATE: 'update',
  EXIT:   'exit'
};

var CONNECTED = 1, DISCONNECTED = 2;

var proto = (Builder.prototype = new Node());

proto.init = function(graph, def, mark, parent, parent_id, inheritFrom) {
  Node.prototype.init.call(this, graph)
    .router(true)
    .collector(true);

  this._def   = def;
  this._mark  = mark;
  this._from  = (def.from ? def.from.data : null) || inheritFrom;
  this._ds    = dl.isString(this._from) ? graph.data(this._from) : null;
  this._map   = {};
  this._status = null; // Connected or disconnected?

  mark.def = def;
  mark.marktype = def.type;
  mark.interactive = (def.interactive !== false);
  mark.items = [];
  if (dl.isValid(def.name)) mark.name = def.name;

  this._parent = parent;
  this._parent_id = parent_id;

  if (def.from && (def.from.mark || def.from.transform || def.from.modify)) {
    inlineDs.call(this);
  }

  // Non-group mark builders are super nodes. Encoder and Bounder remain
  // separate operators but are embedded and called by Builder.evaluate.
  this._isSuper = (this._def.type !== 'group');
  this._encoder = new Encoder(this._graph, this._mark, this);
  this._bounder = new Bounder(this._graph, this._mark);
  this._output  = null; // Output changeset for reactive geom as Bounder reflows

  if (this._ds) { this._encoder.dependency(Deps.DATA, this._from); }

  // Since Builders are super nodes, copy over encoder dependencies
  // (bounder has no registered dependencies).
  this.dependency(Deps.DATA, this._encoder.dependency(Deps.DATA));
  this.dependency(Deps.SCALES, this._encoder.dependency(Deps.SCALES));
  this.dependency(Deps.SIGNALS, this._encoder.dependency(Deps.SIGNALS));

  return this;
};

// Reactive geometry and mark-level transformations are handled here
// because they need their group's data-joined context.
function inlineDs() {
  var from = this._def.from,
      geom = from.mark,
      src, name, spec, sibling, output, input, node;

  if (geom) {
    sibling = this.sibling(geom);
    src  = sibling._isSuper ? sibling : sibling._bounder;
    name = ['vg', this._parent_id, geom, src.listeners(true).length].join('_');
    spec = {
      name: name,
      transform: from.transform,
      modify: from.modify
    };
  } else {
    src = this._graph.data(this._from);
    if (!src) throw Error('Data source "'+this._from+'" is not defined.');
    name = ['vg', this._from, this._def.type, src.listeners(true).length].join('_');
    spec = {
      name: name,
      source: this._from,
      transform: from.transform,
      modify: from.modify
    };
  }

  this._from = name;
  this._ds = parseData.datasource(this._graph, spec);

  if (geom) {
    // Bounder reflows, so we need an intermediary node to propagate
    // the output constructed by the Builder.
    node = new Node(this._graph).addListener(this._ds.listener());
    node.evaluate = function(input) {
      var out  = ChangeSet.create(input),
          sout = sibling._output;

      out.add = sout.add;
      out.mod = sout.mod;
      out.rem = sout.rem;
      return out;
    };
    src.addListener(node);
  } else {
    // At this point, we have a new datasource but it is empty as
    // the propagation cycle has already crossed the datasources.
    // So, we repulse just this datasource. This should be safe
    // as the ds isn't connected to the scenegraph yet.
    output = this._ds.source().last();
    input  = ChangeSet.create(output);

    input.add = output.add;
    input.mod = output.mod;
    input.rem = output.rem;
    input.stamp = null;
    this._graph.propagate(input, this._ds.listener(), output.stamp);
  }
}

proto.ds = function() { return this._ds; };
proto.parent   = function() { return this._parent; };
proto.encoder  = function() { return this._encoder; };
proto.pipeline = function() { return [this]; };

proto.connect = function() {
  var builder = this;

  this._graph.connect(this.pipeline());
  this._encoder._scales.forEach(function(s) {
    if (!(s = builder._parent.scale(s))) return;
    s.addListener(builder);
  });

  if (this._parent) {
    if (this._isSuper) this.addListener(this._parent._collector);
    else this._bounder.addListener(this._parent._collector);
  }

  return (this._status = CONNECTED, this);
};

proto.disconnect = function() {
  var builder = this;
  if (!this._listeners.length) return this;

  function disconnectScales(scales) {
    for(var i=0, len=scales.length, s; i<len; ++i) {
      if (!(s = builder._parent.scale(scales[i]))) continue;
      s.removeListener(builder);
    }
  }

  Node.prototype.disconnect.call(this);
  this._graph.disconnect(this.pipeline());
  disconnectScales(this._encoder._scales);
  disconnectScales(dl.keys(this._mark._scaleRefs));

  return (this._status = DISCONNECTED, this);
};

proto.sibling = function(name) {
  return this._parent.child(name, this._parent_id);
};

proto.evaluate = function(input) {
  log.debug(input, ['building', (this._from || this._def.from), this._def.type]);

  var self = this,
      def = this._mark.def,
      props  = def.properties || {},
      update = props.update   || {},
      output = ChangeSet.create(input),
      fullUpdate, fcs, data, name;

  if (this._ds) {
    // We need to determine if any encoder dependencies have been updated.
    // However, the encoder's data source will likely be updated, and shouldn't
    // trigger all items to mod.
    data = output.data[(name=this._ds.name())];
    output.data[name] = null;
    fullUpdate = this._encoder.reevaluate(output);
    output.data[name] = data;

    fcs = this._ds.last();
    if (!fcs) throw Error('Builder evaluated before backing DataSource.');
    if (fcs.stamp > this._stamp) {
      join.call(this, fcs, output, this._ds.values(), true, fullUpdate);
    } else if (fullUpdate) {
      output.mod = this._mark.items.slice();
    }
  } else {
    data = dl.isFunction(this._def.from) ? this._def.from() : [Sentinel];
    join.call(this, input, output, data);
  }

  // Stash output before Bounder for downstream reactive geometry.
  this._output = output = this._graph.evaluate(output, this._encoder);

  // Add any new scale references to the dependency list, and ensure
  // they're connected.
  if (update.nested && update.nested.length && this._status === CONNECTED) {
    dl.keys(this._mark._scaleRefs).forEach(function(s) {
      var scale = self._parent.scale(s);
      if (!scale) return;

      scale.addListener(self);
      self.dependency(Deps.SCALES, s);
      self._encoder.dependency(Deps.SCALES, s);
    });
  }

  // Supernodes calculate bounds too, but only on items marked dirty.
  if (this._isSuper) {
    output.mod = output.mod.filter(function(x) { return x._dirty; });
    output = this._graph.evaluate(output, this._bounder);
  }

  return output;
};

function newItem() {
  var item = Tuple.ingest(new Item(this._mark));

  // For the root node's item
  if (this._def.width)  Tuple.set(item, 'width',  this._def.width);
  if (this._def.height) Tuple.set(item, 'height', this._def.height);
  return item;
}

function join(input, output, data, ds, fullUpdate) {
  var keyf = keyFunction(this._def.key || (ds ? '_id' : null)),
      prev = this._mark.items || [],
      rem  = ds ? input.rem : prev,
      mod  = Tuple.idMap((!ds || fullUpdate) ? data : input.mod),
      next = [],
      i, key, len, item, datum, enter, diff;

  // Only mark rems as exiting. Due to keyf, there may be an add/mod
  // tuple that replaces it.
  for (i=0, len=rem.length; i<len; ++i) {
    item = (rem[i] === prev[i]) ? prev[i] :
      keyf ? this._map[keyf(rem[i])] : rem[i];
    item.status = Status.EXIT;
  }

  for(i=0, len=data.length; i<len; ++i) {
    datum = data[i];
    item  = keyf ? this._map[key = keyf(datum)] : prev[i];
    enter = item ? false : (item = newItem.call(this), true);
    item.status = enter ? Status.ENTER : Status.UPDATE;
    diff = !enter && item.datum !== datum;
    item.datum = datum;

    if (keyf) {
      Tuple.set(item, 'key', key);
      this._map[key] = item;
    }

    if (enter) {
      output.add.push(item);
    } else if (diff || mod[datum._id]) {
      output.mod.push(item);
    }

    next.push(item);
  }

  for (i=0, len=rem.length; i<len; ++i) {
    item = (rem[i] === prev[i]) ? prev[i] :
      keyf ? this._map[key = keyf(rem[i])] : rem[i];
    if (item.status === Status.EXIT) {
      item._dirty = true;
      input.dirty.push(item);
      next.push(item);
      output.rem.push(item);
      if (keyf) this._map[key] = null;
    }
  }

  return (this._mark.items = next, output);
}

function keyFunction(key) {
  if (key == null) return null;
  var f = dl.array(key).map(dl.accessor);
  return function(d) {
    for (var s='', i=0, n=f.length; i<n; ++i) {
      if (i>0) s += '|';
      s += String(f[i](d));
    }
    return s;
  };
}

module.exports = Builder;


/***/ }),

/***/ "W+IH":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    axs = __webpack_require__("lKLM"),
    themeVal = __webpack_require__("YvtE");

var ORIENT = {
  "x":      "bottom",
  "y":      "left",
  "top":    "top",
  "bottom": "bottom",
  "left":   "left",
  "right":  "right"
};

function parseAxes(model, spec, axes, group) {
  var cfg = config(model);
  (spec || []).forEach(function(def, index) {
    axes[index] = axes[index] || axs(model, cfg[def.type]);
    parseAxis(cfg[def.type], def, index, axes[index], group);
  });
}

function parseAxis(config, def, index, axis, group) {
  // axis scale
  var scale;
  if (def.scale !== undefined) {
    axis.scale(scale = group.scale(def.scale));
  }

  // grid by scaletype
  var grid = config.grid;
  if (dl.isObject(grid)) {
    config.grid = grid[scale.type] !== undefined ? grid[scale.type] : grid.default;
  }

  // axis orientation
  axis.orient(themeVal(def, config, 'orient', ORIENT[def.type]));
  // axis offset
  axis.offset(themeVal(def, config, 'offset', 0));
  // axis layer
  axis.layer(themeVal(def, config, 'layer', 'front'));
  // axis grid lines
  axis.grid(themeVal(def, config, 'grid', false));
  // axis title
  axis.title(def.title || null);
  // axis title offset
  axis.titleOffset(themeVal(def, config, 'titleOffset'));
  // axis values
  axis.tickValues(def.values || null);
  // axis label formatting
  axis.tickFormat(def.format || null);
  axis.tickFormatType(def.formatType || null);
  // axis tick subdivision
  axis.tickSubdivide(def.subdivide || 0);
  // axis tick padding (config.padding for backwards compatibility).
  axis.tickPadding(themeVal(def, config, 'tickPadding', config.padding));

  // axis tick size(s)
  var ts = themeVal(def, config, 'tickSize'),
      size = [ts, ts, ts];

  size[0] = themeVal(def, config, 'tickSizeMajor', size[0]);
  size[1] = themeVal(def, config, 'tickSizeMinor', size[1]);
  size[2] = themeVal(def, config, 'tickSizeEnd', size[2]);

  if (size.length) {
    axis.tickSize.apply(axis, size);
  }

  // axis tick count
  axis.tickCount(themeVal(def, config, 'ticks'));

  // style properties
  var p = def.properties;
  if (p && p.ticks) {
    axis.majorTickProperties(p.majorTicks ?
      dl.extend({}, p.ticks, p.majorTicks) : p.ticks);
    axis.minorTickProperties(p.minorTicks ?
      dl.extend({}, p.ticks, p.minorTicks) : p.ticks);
  } else {
    axis.majorTickProperties(p && p.majorTicks || {});
    axis.minorTickProperties(p && p.minorTicks || {});
  }
  axis.tickLabelProperties(p && p.labels || {});
  axis.titleProperties(p && p.title || {});
  axis.gridLineProperties(p && p.grid || {});
  axis.domainProperties(p && p.axis || {});
}

function config(model) {
  var cfg  = model.config(),
      axis = cfg.axis;

  return {
    x: dl.extend(dl.duplicate(axis), cfg.axis_x),
    y: dl.extend(dl.duplicate(axis), cfg.axis_y)
  };
}

module.exports = parseAxes;

parseAxes.schema = {
  "defs": {
    "axis": {
      "type": "object",
      "properties": {
        "type": {"enum": ["x", "y"]},
        "scale": {"type": "string"},
        "orient": {"enum": ["top", "bottom", "left", "right"]},
        "title": {"type": "string"},
        "titleOffset": {"type": "number"},
        "format": {"type": "string"},
        "formatType": {"enum": ["time", "utc", "string", "number"]},
        "ticks": {"type": "number"},
        "values": {
          "type": "array",
          "items": {"type": ["string", "number"]}
        },
        "subdivide": {"type": "number"},
        "tickPadding": {"type": "number"},
        "tickSize": {"type": "number"},
        "tickSizeMajor": {"type": "number"},
        "tickSizeMinor": {"type": "number"},
        "tickSizeEnd": {"type": "number"},
        "offset": {
          "oneOf": [{"type": "number"}, {
            "type": "object",
            "properties": {
              "scale": {"type": "string"},
              "value": {"type": ["string", "number"]}
            },
            "required": ["scale", "value"],
            "additionalProperties": false
          }]
        },
        "layer": {"enum": ["front", "back"], "default": "front"},
        "grid": {"type": "boolean"},
        "properties": {
          "type": "object",
          "properties": {
            "ticks": {"$ref": "#/defs/propset"},
            "majorTicks": {"$ref": "#/defs/propset"},
            "minorTicks": {"$ref": "#/defs/propset"},
            "labels": {"$ref": "#/defs/propset"},
            "title": {"$ref": "#/defs/propset"},
            "grid": {"$ref": "#/defs/propset"},
            "axis": {"$ref": "#/defs/propset"}
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "required": ["type", "scale"]
    }
  }
};


/***/ }),

/***/ "WCPv":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  'canvas': __webpack_require__("oCE4"),
  'svg':    __webpack_require__("95dH")
};


/***/ }),

/***/ "WFOa":
/***/ (function(module, exports, __webpack_require__) {

function instance(w, h) {
  w = w || 1;
  h = h || 1;
  var canvas;

  if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  } else {
    var Canvas = __webpack_require__(8);
    if (!Canvas.prototype) return null;
    canvas = new Canvas(w, h);
  }
  return lineDash(canvas);
}

function resize(canvas, w, h, p, retina) {
  var g = this._ctx = canvas.getContext('2d'), 
      s = 1;

  canvas.width = w + p.left + p.right;
  canvas.height = h + p.top + p.bottom;

  // if browser canvas, attempt to modify for retina display
  if (retina && typeof HTMLElement !== 'undefined' &&
      canvas instanceof HTMLElement)
  {
    g.pixelratio = (s = pixelRatio(canvas) || 1);
  }

  g.setTransform(s, 0, 0, s, s*p.left, s*p.top);
  return canvas;
}

function pixelRatio(canvas) {
  var g = canvas.getContext('2d');

  // get canvas pixel data
  var devicePixelRatio = window && window.devicePixelRatio || 1,
      backingStoreRatio = (
        g.webkitBackingStorePixelRatio ||
        g.mozBackingStorePixelRatio ||
        g.msBackingStorePixelRatio ||
        g.oBackingStorePixelRatio ||
        g.backingStorePixelRatio) || 1,
      ratio = devicePixelRatio / backingStoreRatio;

  if (devicePixelRatio !== backingStoreRatio) {
    // set actual and visible canvas size
    var w = canvas.width,
        h = canvas.height;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  return ratio;
}

function lineDash(canvas) {
  var g = canvas.getContext('2d');
  if (g.vgLineDash) return; // already initialized!

  var NOOP = function() {},
      NODASH = [];
  
  if (g.setLineDash) {
    g.vgLineDash = function(dash) { this.setLineDash(dash || NODASH); };
    g.vgLineDashOffset = function(off) { this.lineDashOffset = off; };
  } else if (g.webkitLineDash !== undefined) {
  	g.vgLineDash = function(dash) { this.webkitLineDash = dash || NODASH; };
    g.vgLineDashOffset = function(off) { this.webkitLineDashOffset = off; };
  } else if (g.mozDash !== undefined) {
    g.vgLineDash = function(dash) { this.mozDash = dash; };
    g.vgLineDashOffset = NOOP;
  } else {
    g.vgLineDash = NOOP;
    g.vgLineDashOffset = NOOP;
  }
  return canvas;
}

module.exports = {
  instance:   instance,
  resize:     resize,
  lineDash:   lineDash
};


/***/ }),

/***/ "WJ2w":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (Type) {
    Type[Type["QUANTITATIVE"] = 'quantitative'] = "QUANTITATIVE";
    Type[Type["ORDINAL"] = 'ordinal'] = "ORDINAL";
    Type[Type["TEMPORAL"] = 'temporal'] = "TEMPORAL";
    Type[Type["NOMINAL"] = 'nominal'] = "NOMINAL";
})(exports.Type || (exports.Type = {}));
var Type = exports.Type;
exports.QUANTITATIVE = Type.QUANTITATIVE;
exports.ORDINAL = Type.ORDINAL;
exports.TEMPORAL = Type.TEMPORAL;
exports.NOMINAL = Type.NOMINAL;
exports.SHORT_TYPE = {
    quantitative: 'Q',
    temporal: 'T',
    nominal: 'N',
    ordinal: 'O'
};
exports.TYPE_FROM_SHORT_TYPE = {
    Q: exports.QUANTITATIVE,
    T: exports.TEMPORAL,
    O: exports.ORDINAL,
    N: exports.NOMINAL
};
function getFullName(type) {
    var typeString = type;
    return exports.TYPE_FROM_SHORT_TYPE[typeString.toUpperCase()] ||
        typeString.toLowerCase();
}
exports.getFullName = getFullName;
//# sourceMappingURL=type.js.map

/***/ }),

/***/ "Wd6V":
/***/ (function(module, exports, __webpack_require__) {

var Bounds = __webpack_require__("lnKO"),
    textBounds = __webpack_require__("BONk").text,
    text = __webpack_require__("3Scv"),
    util = __webpack_require__("gWW/"),
    tempBounds = new Bounds();

function draw(g, scene, bounds) {
  if (!scene.items || !scene.items.length) return;

  var items = scene.items,
      o, opac, x, y, r, t, str;

  for (var i=0, len=items.length; i<len; ++i) {
    o = items[i];
    if (bounds && !bounds.intersects(o.bounds))
      continue; // bounds check

    str = text.value(o.text);
    if (!str) continue;
    opac = o.opacity == null ? 1 : o.opacity;
    if (opac === 0) continue;

    g.font = text.font(o);
    g.textAlign = o.align || 'left';

    x = (o.x || 0);
    y = (o.y || 0);
    if ((r = o.radius)) {
      t = (o.theta || 0) - Math.PI/2;
      x += r * Math.cos(t);
      y += r * Math.sin(t);
    }

    if (o.angle) {
      g.save();
      g.translate(x, y);
      g.rotate(o.angle * Math.PI/180);
      x = y = 0; // reset x, y
    }
    x += (o.dx || 0);
    y += (o.dy || 0) + text.offset(o);

    if (o.fill && util.fill(g, o, opac)) {
      g.fillText(str, x, y);
    }
    if (o.stroke && util.stroke(g, o, opac)) {
      g.strokeText(str, x, y);
    }
    if (o.angle) g.restore();
  }
}

function hit(g, o, x, y, gx, gy) {
  if (o.fontSize <= 0) return false;
  if (!o.angle) return true; // bounds sufficient if no rotation

  // project point into space of unrotated bounds
  var b = textBounds(o, tempBounds, true),
      a = -o.angle * Math.PI / 180,
      cos = Math.cos(a),
      sin = Math.sin(a),
      ox = o.x,
      oy = o.y,
      px = cos*gx - sin*gy + (ox - ox*cos + oy*sin),
      py = sin*gx + cos*gy + (oy - ox*sin - oy*cos);

  return b.contains(px, py);
}

module.exports = {
  draw: draw,
  pick: util.pick(hit)
};


/***/ }),

/***/ "Wwtv":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var util_1 = __webpack_require__("ZAUf");
var config_1 = __webpack_require__("Py5Z");
var data_1 = __webpack_require__("V22v");
var layout_1 = __webpack_require__("YBv9");
var model_1 = __webpack_require__("jGoH");
var common_1 = __webpack_require__("MtYt");
var vega_schema_1 = __webpack_require__("7YRp");
var LayerModel = (function (_super) {
    __extends(LayerModel, _super);
    function LayerModel(spec, parent, parentGivenName) {
        var _this = this;
        _super.call(this, spec, parent, parentGivenName);
        this._config = this._initConfig(spec.config, parent);
        this._children = spec.layers.map(function (layer, i) {
            return common_1.buildModel(layer, _this, _this.name('layer_' + i));
        });
    }
    LayerModel.prototype._initConfig = function (specConfig, parent) {
        return util_1.mergeDeep(util_1.duplicate(config_1.defaultConfig), specConfig, parent ? parent.config() : {});
    };
    LayerModel.prototype.has = function (channel) {
        return false;
    };
    LayerModel.prototype.children = function () {
        return this._children;
    };
    LayerModel.prototype.isOrdinalScale = function (channel) {
        return this._children[0].isOrdinalScale(channel);
    };
    LayerModel.prototype.dataTable = function () {
        return this._children[0].dataTable();
    };
    LayerModel.prototype.fieldDef = function (channel) {
        return null;
    };
    LayerModel.prototype.stack = function () {
        return null;
    };
    LayerModel.prototype.parseData = function () {
        this._children.forEach(function (child) {
            child.parseData();
        });
        this.component.data = data_1.parseLayerData(this);
    };
    LayerModel.prototype.parseSelectionData = function () {
    };
    LayerModel.prototype.parseLayoutData = function () {
        this._children.forEach(function (child, i) {
            child.parseLayoutData();
        });
        this.component.layout = layout_1.parseLayerLayout(this);
    };
    LayerModel.prototype.parseScale = function () {
        var model = this;
        var scaleComponent = this.component.scale = {};
        this._children.forEach(function (child) {
            child.parseScale();
            if (true) {
                util_1.keys(child.component.scale).forEach(function (channel) {
                    var childScales = child.component.scale[channel];
                    if (!childScales) {
                        return;
                    }
                    var modelScales = scaleComponent[channel];
                    if (modelScales && modelScales.main) {
                        var modelDomain = modelScales.main.domain;
                        var childDomain = childScales.main.domain;
                        if (util_1.isArray(modelDomain)) {
                            if (util_1.isArray(childScales.main.domain)) {
                                modelScales.main.domain = modelDomain.concat(childDomain);
                            }
                            else {
                                model.addWarning('custom domain scale cannot be unioned with default field-based domain');
                            }
                        }
                        else {
                            var unionedFields = vega_schema_1.isUnionedDomain(modelDomain) ? modelDomain.fields : [modelDomain];
                            if (util_1.isArray(childDomain)) {
                                model.addWarning('custom domain scale cannot be unioned with default field-based domain');
                            }
                            var fields = vega_schema_1.isDataRefDomain(childDomain) ? unionedFields.concat([childDomain]) :
                                vega_schema_1.isUnionedDomain(childDomain) ? unionedFields.concat(childDomain.fields) :
                                    unionedFields;
                            fields = util_1.unique(fields, util_1.hash);
                            if (fields.length > 1) {
                                modelScales.main.domain = { fields: fields };
                            }
                            else {
                                modelScales.main.domain = fields[0];
                            }
                        }
                        modelScales.colorLegend = modelScales.colorLegend ? modelScales.colorLegend : childScales.colorLegend;
                        modelScales.binColorLegend = modelScales.binColorLegend ? modelScales.binColorLegend : childScales.binColorLegend;
                    }
                    else {
                        scaleComponent[channel] = childScales;
                    }
                    util_1.vals(childScales).forEach(function (scale) {
                        var scaleNameWithoutPrefix = scale.name.substr(child.name('').length);
                        var newName = model.scaleName(scaleNameWithoutPrefix);
                        child.renameScale(scale.name, newName);
                        scale.name = newName;
                    });
                    delete childScales[channel];
                });
            }
        });
    };
    LayerModel.prototype.parseMark = function () {
        this._children.forEach(function (child) {
            child.parseMark();
        });
    };
    LayerModel.prototype.parseAxis = function () {
        var axisComponent = this.component.axis = {};
        this._children.forEach(function (child) {
            child.parseAxis();
            if (true) {
                util_1.keys(child.component.axis).forEach(function (channel) {
                    if (!axisComponent[channel]) {
                        axisComponent[channel] = child.component.axis[channel];
                    }
                });
            }
        });
    };
    LayerModel.prototype.parseAxisGroup = function () {
        return null;
    };
    LayerModel.prototype.parseGridGroup = function () {
        return null;
    };
    LayerModel.prototype.parseLegend = function () {
        var legendComponent = this.component.legend = {};
        this._children.forEach(function (child) {
            child.parseLegend();
            if (true) {
                util_1.keys(child.component.legend).forEach(function (channel) {
                    if (!legendComponent[channel]) {
                        legendComponent[channel] = child.component.legend[channel];
                    }
                });
            }
        });
    };
    LayerModel.prototype.assembleParentGroupProperties = function () {
        return null;
    };
    LayerModel.prototype.assembleData = function (data) {
        data_1.assembleData(this, data);
        this._children.forEach(function (child) {
            child.assembleData(data);
        });
        return data;
    };
    LayerModel.prototype.assembleLayout = function (layoutData) {
        this._children.forEach(function (child) {
            child.assembleLayout(layoutData);
        });
        return layout_1.assembleLayout(this, layoutData);
    };
    LayerModel.prototype.assembleMarks = function () {
        return util_1.flatten(this._children.map(function (child) {
            return child.assembleMarks();
        }));
    };
    LayerModel.prototype.channels = function () {
        return [];
    };
    LayerModel.prototype.mapping = function () {
        return null;
    };
    LayerModel.prototype.isLayer = function () {
        return true;
    };
    LayerModel.prototype.compatibleSource = function (child) {
        var data = this.data();
        var childData = child.component.data;
        var compatible = !childData.source || (data && data.url === childData.source.url);
        return compatible;
    };
    return LayerModel;
}(model_1.Model));
exports.LayerModel = LayerModel;
//# sourceMappingURL=layer.js.map

/***/ }),

/***/ "XL1Y":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var common_1 = __webpack_require__("MtYt");
var tick;
(function (tick) {
    function markType() {
        return 'rect';
    }
    tick.markType = markType;
    function properties(model) {
        var p = {};
        var config = model.config();
        p.xc = x(model.encoding().x, model.scaleName(channel_1.X), config);
        p.yc = y(model.encoding().y, model.scaleName(channel_1.Y), config);
        if (config.mark.orient === 'horizontal') {
            p.width = size(model.encoding().size, model.scaleName(channel_1.SIZE), config, (model.scale(channel_1.X) || {}).bandSize);
            p.height = { value: config.mark.tickThickness };
        }
        else {
            p.width = { value: config.mark.tickThickness };
            p.height = size(model.encoding().size, model.scaleName(channel_1.SIZE), config, (model.scale(channel_1.Y) || {}).bandSize);
        }
        common_1.applyColorAndOpacity(p, model);
        return p;
    }
    tick.properties = properties;
    function x(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
            else if (fieldDef.value) {
                return { value: fieldDef.value };
            }
        }
        return { value: config.scale.bandSize / 2 };
    }
    function y(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
            else if (fieldDef.value) {
                return { value: fieldDef.value };
            }
        }
        return { value: config.scale.bandSize / 2 };
    }
    function size(fieldDef, scaleName, config, scaleBandSize) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fieldDef.field
                };
            }
            else if (fieldDef.value !== undefined) {
                return { value: fieldDef.value };
            }
        }
        if (config.mark.tickSize) {
            return { value: config.mark.tickSize };
        }
        var bandSize = scaleBandSize !== undefined ?
            scaleBandSize :
            config.scale.bandSize;
        return { value: bandSize / 1.5 };
    }
    function labels(model) {
        return undefined;
    }
    tick.labels = labels;
})(tick = exports.tick || (exports.tick = {}));
//# sourceMappingURL=tick.js.map

/***/ }),

/***/ "XSKZ":
/***/ (function(module, exports) {

module.exports = (function() {
  "use strict";

  /*
   * Generated by PEG.js 0.9.0.
   *
   * http://pegjs.org/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function peg$SyntaxError(message, expected, found, location) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.location = location;
    this.name     = "SyntaxError";

    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, peg$SyntaxError);
    }
  }

  peg$subclass(peg$SyntaxError, Error);

  function peg$parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},
        parser  = this,

        peg$FAILED = {},

        peg$startRuleFunctions = { start: peg$parsestart },
        peg$startRuleFunction  = peg$parsestart,

        peg$c0 = ",",
        peg$c1 = { type: "literal", value: ",", description: "\",\"" },
        peg$c2 = function(o, m) { return [o].concat(m); },
        peg$c3 = function(o) { return [o]; },
        peg$c4 = "[",
        peg$c5 = { type: "literal", value: "[", description: "\"[\"" },
        peg$c6 = "]",
        peg$c7 = { type: "literal", value: "]", description: "\"]\"" },
        peg$c8 = ">",
        peg$c9 = { type: "literal", value: ">", description: "\">\"" },
        peg$c10 = function(f1, f2, o) {
            return {
              start: f1, middle: o, end: f2,
              str: '['+f1.str+', '+f2.str+'] > '+o.str};
            },
        peg$c11 = function(s, f) {
            s.filters = f;
            s.str += f.map(function(x) { return '['+x+']'; }).join('');
            return s;
          },
        peg$c12 = function(s) { return s; },
        peg$c13 = "(",
        peg$c14 = { type: "literal", value: "(", description: "\"(\"" },
        peg$c15 = ")",
        peg$c16 = { type: "literal", value: ")", description: "\")\"" },
        peg$c17 = function(m) {
            return {
              stream: m,
              str: '('+m.map(function(m) { return m.str; }).join(', ')+')'
            };
          },
        peg$c18 = "@",
        peg$c19 = { type: "literal", value: "@", description: "\"@\"" },
        peg$c20 = ":",
        peg$c21 = { type: "literal", value: ":", description: "\":\"" },
        peg$c22 = function(n, e) { return {event: e, name: n, str: '@'+n+':'+e}; },
        peg$c23 = function(m, e) { return {event: e, mark: m, str: m+':'+e}; },
        peg$c24 = function(t, e) { return {event: e, target: t, str: t+':'+e}; },
        peg$c25 = function(e) { return {event: e, str: e}; },
        peg$c26 = function(s) { return {signal: s, str: s}; },
        peg$c27 = "rect",
        peg$c28 = { type: "literal", value: "rect", description: "\"rect\"" },
        peg$c29 = "symbol",
        peg$c30 = { type: "literal", value: "symbol", description: "\"symbol\"" },
        peg$c31 = "path",
        peg$c32 = { type: "literal", value: "path", description: "\"path\"" },
        peg$c33 = "arc",
        peg$c34 = { type: "literal", value: "arc", description: "\"arc\"" },
        peg$c35 = "area",
        peg$c36 = { type: "literal", value: "area", description: "\"area\"" },
        peg$c37 = "line",
        peg$c38 = { type: "literal", value: "line", description: "\"line\"" },
        peg$c39 = "rule",
        peg$c40 = { type: "literal", value: "rule", description: "\"rule\"" },
        peg$c41 = "image",
        peg$c42 = { type: "literal", value: "image", description: "\"image\"" },
        peg$c43 = "text",
        peg$c44 = { type: "literal", value: "text", description: "\"text\"" },
        peg$c45 = "group",
        peg$c46 = { type: "literal", value: "group", description: "\"group\"" },
        peg$c47 = "mousedown",
        peg$c48 = { type: "literal", value: "mousedown", description: "\"mousedown\"" },
        peg$c49 = "mouseup",
        peg$c50 = { type: "literal", value: "mouseup", description: "\"mouseup\"" },
        peg$c51 = "click",
        peg$c52 = { type: "literal", value: "click", description: "\"click\"" },
        peg$c53 = "dblclick",
        peg$c54 = { type: "literal", value: "dblclick", description: "\"dblclick\"" },
        peg$c55 = "wheel",
        peg$c56 = { type: "literal", value: "wheel", description: "\"wheel\"" },
        peg$c57 = "keydown",
        peg$c58 = { type: "literal", value: "keydown", description: "\"keydown\"" },
        peg$c59 = "keypress",
        peg$c60 = { type: "literal", value: "keypress", description: "\"keypress\"" },
        peg$c61 = "keyup",
        peg$c62 = { type: "literal", value: "keyup", description: "\"keyup\"" },
        peg$c63 = "mousewheel",
        peg$c64 = { type: "literal", value: "mousewheel", description: "\"mousewheel\"" },
        peg$c65 = "mousemove",
        peg$c66 = { type: "literal", value: "mousemove", description: "\"mousemove\"" },
        peg$c67 = "mouseout",
        peg$c68 = { type: "literal", value: "mouseout", description: "\"mouseout\"" },
        peg$c69 = "mouseover",
        peg$c70 = { type: "literal", value: "mouseover", description: "\"mouseover\"" },
        peg$c71 = "mouseenter",
        peg$c72 = { type: "literal", value: "mouseenter", description: "\"mouseenter\"" },
        peg$c73 = "touchstart",
        peg$c74 = { type: "literal", value: "touchstart", description: "\"touchstart\"" },
        peg$c75 = "touchmove",
        peg$c76 = { type: "literal", value: "touchmove", description: "\"touchmove\"" },
        peg$c77 = "touchend",
        peg$c78 = { type: "literal", value: "touchend", description: "\"touchend\"" },
        peg$c79 = "dragenter",
        peg$c80 = { type: "literal", value: "dragenter", description: "\"dragenter\"" },
        peg$c81 = "dragover",
        peg$c82 = { type: "literal", value: "dragover", description: "\"dragover\"" },
        peg$c83 = "dragleave",
        peg$c84 = { type: "literal", value: "dragleave", description: "\"dragleave\"" },
        peg$c85 = function(e) { return e; },
        peg$c86 = /^[a-zA-Z0-9_\-]/,
        peg$c87 = { type: "class", value: "[a-zA-Z0-9_-]", description: "[a-zA-Z0-9_-]" },
        peg$c88 = function(n) { return n.join(''); },
        peg$c89 = /^[a-zA-Z0-9\-_  #.>+~[\]=|\^$*]/,
        peg$c90 = { type: "class", value: "[a-zA-Z0-9-_  #\\.\\>\\+~\\[\\]=|\\^\\$\\*]", description: "[a-zA-Z0-9-_  #\\.\\>\\+~\\[\\]=|\\^\\$\\*]" },
        peg$c91 = function(c) { return c.join(''); },
        peg$c92 = /^['"a-zA-Z0-9_().><=! \t-&|~]/,
        peg$c93 = { type: "class", value: "['\"a-zA-Z0-9_\\(\\)\\.\\>\\<\\=\\! \\t-&|~]", description: "['\"a-zA-Z0-9_\\(\\)\\.\\>\\<\\=\\! \\t-&|~]" },
        peg$c94 = function(v) { return v.join(''); },
        peg$c95 = /^[ \t\r\n]/,
        peg$c96 = { type: "class", value: "[ \\t\\r\\n]", description: "[ \\t\\r\\n]" },

        peg$currPos          = 0,
        peg$savedPos         = 0,
        peg$posDetailsCache  = [{ line: 1, column: 1, seenCR: false }],
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
    }

    function text() {
      return input.substring(peg$savedPos, peg$currPos);
    }

    function location() {
      return peg$computeLocation(peg$savedPos, peg$currPos);
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function error(message) {
      throw peg$buildException(
        message,
        null,
        input.substring(peg$savedPos, peg$currPos),
        peg$computeLocation(peg$savedPos, peg$currPos)
      );
    }

    function peg$computePosDetails(pos) {
      var details = peg$posDetailsCache[pos],
          p, ch;

      if (details) {
        return details;
      } else {
        p = pos - 1;
        while (!peg$posDetailsCache[p]) {
          p--;
        }

        details = peg$posDetailsCache[p];
        details = {
          line:   details.line,
          column: details.column,
          seenCR: details.seenCR
        };

        while (p < pos) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }

          p++;
        }

        peg$posDetailsCache[pos] = details;
        return details;
      }
    }

    function peg$computeLocation(startPos, endPos) {
      var startPosDetails = peg$computePosDetails(startPos),
          endPosDetails   = peg$computePosDetails(endPos);

      return {
        start: {
          offset: startPos,
          line:   startPosDetails.line,
          column: startPosDetails.column
        },
        end: {
          offset: endPos,
          line:   endPosDetails.line,
          column: endPosDetails.column
        }
      };
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, found, location) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0100-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1000-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new peg$SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        location
      );
    }

    function peg$parsestart() {
      var s0;

      s0 = peg$parsemerged();

      return s0;
    }

    function peg$parsemerged() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$parseordered();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsesep();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s3 = peg$c0;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c1); }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsesep();
            if (s4 !== peg$FAILED) {
              s5 = peg$parsemerged();
              if (s5 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c2(s1, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseordered();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c3(s1);
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parseordered() {
      var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c4;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c5); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsesep();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsefiltered();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsesep();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 44) {
                s5 = peg$c0;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c1); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parsesep();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parsefiltered();
                  if (s7 !== peg$FAILED) {
                    s8 = peg$parsesep();
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 93) {
                        s9 = peg$c6;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c7); }
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parsesep();
                        if (s10 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 62) {
                            s11 = peg$c8;
                            peg$currPos++;
                          } else {
                            s11 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c9); }
                          }
                          if (s11 !== peg$FAILED) {
                            s12 = peg$parsesep();
                            if (s12 !== peg$FAILED) {
                              s13 = peg$parseordered();
                              if (s13 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c10(s3, s7, s13);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$parsefiltered();
      }

      return s0;
    }

    function peg$parsefiltered() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsestream();
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsefilter();
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parsefilter();
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c11(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parsestream();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c12(s1);
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsestream() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c13;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c14); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsemerged();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s3 = peg$c15;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c16); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c17(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 64) {
          s1 = peg$c18;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c19); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parsename();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s3 = peg$c20;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c21); }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseeventType();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c22(s2, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parsemarkType();
          if (s1 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s2 = peg$c20;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c21); }
            }
            if (s2 !== peg$FAILED) {
              s3 = peg$parseeventType();
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c23(s1, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parsecss();
            if (s1 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 58) {
                s2 = peg$c20;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c21); }
              }
              if (s2 !== peg$FAILED) {
                s3 = peg$parseeventType();
                if (s3 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c24(s1, s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseeventType();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c25(s1);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parsename();
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c26(s1);
                }
                s0 = s1;
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsemarkType() {
      var s0;

      if (input.substr(peg$currPos, 4) === peg$c27) {
        s0 = peg$c27;
        peg$currPos += 4;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c28); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 6) === peg$c29) {
          s0 = peg$c29;
          peg$currPos += 6;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c30); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 4) === peg$c31) {
            s0 = peg$c31;
            peg$currPos += 4;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c32); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c33) {
              s0 = peg$c33;
              peg$currPos += 3;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 4) === peg$c35) {
                s0 = peg$c35;
                peg$currPos += 4;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c36); }
              }
              if (s0 === peg$FAILED) {
                if (input.substr(peg$currPos, 4) === peg$c37) {
                  s0 = peg$c37;
                  peg$currPos += 4;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c38); }
                }
                if (s0 === peg$FAILED) {
                  if (input.substr(peg$currPos, 4) === peg$c39) {
                    s0 = peg$c39;
                    peg$currPos += 4;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c40); }
                  }
                  if (s0 === peg$FAILED) {
                    if (input.substr(peg$currPos, 5) === peg$c41) {
                      s0 = peg$c41;
                      peg$currPos += 5;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c42); }
                    }
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 4) === peg$c43) {
                        s0 = peg$c43;
                        peg$currPos += 4;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c44); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 5) === peg$c45) {
                          s0 = peg$c45;
                          peg$currPos += 5;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c46); }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parseeventType() {
      var s0;

      if (input.substr(peg$currPos, 9) === peg$c47) {
        s0 = peg$c47;
        peg$currPos += 9;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c48); }
      }
      if (s0 === peg$FAILED) {
        if (input.substr(peg$currPos, 7) === peg$c49) {
          s0 = peg$c49;
          peg$currPos += 7;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c50); }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 5) === peg$c51) {
            s0 = peg$c51;
            peg$currPos += 5;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c52); }
          }
          if (s0 === peg$FAILED) {
            if (input.substr(peg$currPos, 8) === peg$c53) {
              s0 = peg$c53;
              peg$currPos += 8;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c54); }
            }
            if (s0 === peg$FAILED) {
              if (input.substr(peg$currPos, 5) === peg$c55) {
                s0 = peg$c55;
                peg$currPos += 5;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c56); }
              }
              if (s0 === peg$FAILED) {
                if (input.substr(peg$currPos, 7) === peg$c57) {
                  s0 = peg$c57;
                  peg$currPos += 7;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c58); }
                }
                if (s0 === peg$FAILED) {
                  if (input.substr(peg$currPos, 8) === peg$c59) {
                    s0 = peg$c59;
                    peg$currPos += 8;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c60); }
                  }
                  if (s0 === peg$FAILED) {
                    if (input.substr(peg$currPos, 5) === peg$c61) {
                      s0 = peg$c61;
                      peg$currPos += 5;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c62); }
                    }
                    if (s0 === peg$FAILED) {
                      if (input.substr(peg$currPos, 10) === peg$c63) {
                        s0 = peg$c63;
                        peg$currPos += 10;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c64); }
                      }
                      if (s0 === peg$FAILED) {
                        if (input.substr(peg$currPos, 9) === peg$c65) {
                          s0 = peg$c65;
                          peg$currPos += 9;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c66); }
                        }
                        if (s0 === peg$FAILED) {
                          if (input.substr(peg$currPos, 8) === peg$c67) {
                            s0 = peg$c67;
                            peg$currPos += 8;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c68); }
                          }
                          if (s0 === peg$FAILED) {
                            if (input.substr(peg$currPos, 9) === peg$c69) {
                              s0 = peg$c69;
                              peg$currPos += 9;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c70); }
                            }
                            if (s0 === peg$FAILED) {
                              if (input.substr(peg$currPos, 10) === peg$c71) {
                                s0 = peg$c71;
                                peg$currPos += 10;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c72); }
                              }
                              if (s0 === peg$FAILED) {
                                if (input.substr(peg$currPos, 10) === peg$c73) {
                                  s0 = peg$c73;
                                  peg$currPos += 10;
                                } else {
                                  s0 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                }
                                if (s0 === peg$FAILED) {
                                  if (input.substr(peg$currPos, 9) === peg$c75) {
                                    s0 = peg$c75;
                                    peg$currPos += 9;
                                  } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                  }
                                  if (s0 === peg$FAILED) {
                                    if (input.substr(peg$currPos, 8) === peg$c77) {
                                      s0 = peg$c77;
                                      peg$currPos += 8;
                                    } else {
                                      s0 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                    }
                                    if (s0 === peg$FAILED) {
                                      if (input.substr(peg$currPos, 9) === peg$c79) {
                                        s0 = peg$c79;
                                        peg$currPos += 9;
                                      } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                      }
                                      if (s0 === peg$FAILED) {
                                        if (input.substr(peg$currPos, 8) === peg$c81) {
                                          s0 = peg$c81;
                                          peg$currPos += 8;
                                        } else {
                                          s0 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c82); }
                                        }
                                        if (s0 === peg$FAILED) {
                                          if (input.substr(peg$currPos, 9) === peg$c83) {
                                            s0 = peg$c83;
                                            peg$currPos += 9;
                                          } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c84); }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      return s0;
    }

    function peg$parsefilter() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c4;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c5); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseexpr();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 93) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c7); }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c85(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }

      return s0;
    }

    function peg$parsename() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c86.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c87); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c86.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c87); }
          }
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c88(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsecss() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c89.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c90); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c89.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c90); }
          }
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c91(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseexpr() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c92.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c93); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c92.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c93); }
          }
        }
      } else {
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c94(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsesep() {
      var s0, s1;

      s0 = [];
      if (peg$c95.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c96); }
      }
      while (s1 !== peg$FAILED) {
        s0.push(s1);
        if (peg$c95.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c96); }
        }
      }

      return s0;
    }

    peg$result = peg$startRuleFunction();

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(
        null,
        peg$maxFailExpected,
        peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
        peg$maxFailPos < input.length
          ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
          : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
      );
    }
  }

  return {
    SyntaxError: peg$SyntaxError,
    parse:       peg$parse
  };
})();


/***/ }),

/***/ "XVii":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    df = __webpack_require__("Hqva"),
    Node = df.Node, // jshint ignore:line
    Deps = df.Dependencies,
    bound = __webpack_require__("LHV8").bound;

var EMPTY = {};

function Encoder(graph, mark, builder) {
  var props  = mark.def.properties || {},
      enter  = props.enter,
      update = props.update,
      exit   = props.exit;

  Node.prototype.init.call(this, graph);

  this._mark = mark;
  this._builder = builder;
  var s = this._scales = [];

  // Only scales used in the 'update' property set are set as
  // encoder depedencies to have targeted reevaluations. However,
  // we still want scales in 'enter' and 'exit' to be evaluated
  // before the encoder.
  if (enter) s.push.apply(s, enter.scales);

  if (update) {
    this.dependency(Deps.DATA, update.data);
    this.dependency(Deps.SIGNALS, update.signals);
    this.dependency(Deps.FIELDS, update.fields);
    this.dependency(Deps.SCALES, update.scales);
    s.push.apply(s, update.scales);
  }

  if (exit) s.push.apply(s, exit.scales);

  return this.mutates(true);
}

var proto = (Encoder.prototype = new Node());

proto.evaluate = function(input) {
  log.debug(input, ['encoding', this._mark.def.type]);
  var graph = this._graph,
      props = this._mark.def.properties || {},
      items = this._mark.items,
      enter  = props.enter,
      update = props.update,
      exit   = props.exit,
      dirty  = input.dirty,
      preds  = graph.predicates(),
      req = input.request,
      group = this._mark.group,
      guide = group && (group.mark.axis || group.mark.legend),
      db = EMPTY, sg = EMPTY, i, len, item, prop;

  if (req && !guide) {
    if ((prop = props[req]) && input.mod.length) {
      db = prop.data ? graph.values(Deps.DATA, prop.data) : null;
      sg = prop.signals ? graph.values(Deps.SIGNALS, prop.signals) : null;

      for (i=0, len=input.mod.length; i<len; ++i) {
        item = input.mod[i];
        encode.call(this, prop, item, input.trans, db, sg, preds, dirty);
      }
    }

    return input; // exit early if given request
  }

  db = values(Deps.DATA, graph, input, props);
  sg = values(Deps.SIGNALS, graph, input, props);

  // Items marked for removal are at the tail of items. Process them first.
  for (i=0, len=input.rem.length; i<len; ++i) {
    item = input.rem[i];
    if (exit) encode.call(this, exit, item, input.trans, db, sg, preds, dirty);
    if (input.trans && !exit) input.trans.interpolate(item, EMPTY);
    else if (!input.trans) items.pop();
  }

  var update_status = __webpack_require__("Vp7n").STATUS.UPDATE;
  for (i=0, len=input.add.length; i<len; ++i) {
    item = input.add[i];
    if (enter)  encode.call(this, enter,  item, input.trans, db, sg, preds, dirty);
    if (update) encode.call(this, update, item, input.trans, db, sg, preds, dirty);
    item.status = update_status;
  }

  if (update) {
    for (i=0, len=input.mod.length; i<len; ++i) {
      item = input.mod[i];
      encode.call(this, update, item, input.trans, db, sg, preds, dirty);
    }
  }

  return input;
};

// Only marshal necessary data and signal values
function values(type, graph, input, props) {
  var p, x, o, add = input.add.length;
  if ((p=props.enter) && (x=p[type]).length && add) {
    o = graph.values(type, x, (o=o||{}));
  }
  if ((p=props.exit) && (x=p[type]).length && input.rem.length) {
    o = graph.values(type, x, (o=o||{}));
  }
  if ((p=props.update) && (x=p[type]).length && (add || input.mod.length)) {
    o = graph.values(type, x, (o=o||{}));
  }
  return o || EMPTY;
}

function encode(prop, item, trans, db, sg, preds, dirty) {
  var enc = prop.encode,
      wasDirty = item._dirty,
      isDirty  = enc.call(enc, item, item.mark.group||item, trans, db, sg, preds);

  item._dirty = isDirty || wasDirty;
  if (isDirty && !wasDirty) dirty.push(item);
}

// If a specified property set called, or update property set
// uses nested fieldrefs, reevaluate all items.
proto.reevaluate = function(pulse) {
  var def = this._mark.def,
      props = def.properties || {},
      reeval = dl.isFunction(def.from) || def.orient || pulse.request ||
        Node.prototype.reevaluate.call(this, pulse);

  return reeval || (props.update ? nestedRefs.call(this) : false);
};

// Test if any nested refs trigger a reflow of mark items.
function nestedRefs() {
  var refs = this._mark.def.properties.update.nested,
      parent = this._builder,
      level = 0,
      i = 0, len = refs.length,
      ref, ds, stamp;

  for (; i<len; ++i) {
    ref = refs[i];

    // Scale references are resolved via this._mark._scaleRefs which are
    // added to dependency lists + connected in Builder.evaluate.
    if (ref.scale) continue;

    for (; level<ref.level; ++level) {
      parent = parent.parent();
      ds = parent.ds();
    }

    // Compare stamps to determine if a change in a group's properties
    // or data should trigger a reeval. We cannot check anything fancier
    // (e.g., pulse.fields) as the ref may use item.datum.
    stamp = (ref.group ? parent.encoder() : ds.last())._stamp;
    if (stamp > this._stamp) return true;
  }

  return false;
}

// Short-circuit encoder if user specifies items
Encoder.update = function(graph, trans, request, items, dirty) {
  items = dl.array(items);
  var preds = graph.predicates(),
      db = graph.values(Deps.DATA),
      sg = graph.values(Deps.SIGNALS),
      i, len, item, props, prop;

  for (i=0, len=items.length; i<len; ++i) {
    item = items[i];
    props = item.mark.def.properties;
    prop = props && props[request];
    if (prop) {
      encode.call(null, prop, item, trans, db, sg, preds, dirty);
      bound.item(item);
    }
  }

};

module.exports = Encoder;


/***/ }),

/***/ "YBv9":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var data_1 = __webpack_require__("x6Fv");
var scale_1 = __webpack_require__("Fw/k");
var util_1 = __webpack_require__("ZAUf");
var mark_1 = __webpack_require__("j8cM");
var time_1 = __webpack_require__("wKIX");
function assembleLayout(model, layoutData) {
    var layoutComponent = model.component.layout;
    if (!layoutComponent.width && !layoutComponent.height) {
        return layoutData;
    }
    if (true) {
        var distinctFields = util_1.keys(util_1.extend(layoutComponent.width.distinct, layoutComponent.height.distinct));
        var formula = layoutComponent.width.formula.concat(layoutComponent.height.formula)
            .map(function (formula) {
            return util_1.extend({ type: 'formula' }, formula);
        });
        return [
            distinctFields.length > 0 ? {
                name: model.dataName(data_1.LAYOUT),
                source: model.dataTable(),
                transform: [{
                        type: 'aggregate',
                        summarize: distinctFields.map(function (field) {
                            return { field: field, ops: ['distinct'] };
                        })
                    }].concat(formula)
            } : {
                name: model.dataName(data_1.LAYOUT),
                values: [{}],
                transform: formula
            }
        ];
    }
}
exports.assembleLayout = assembleLayout;
function parseUnitLayout(model) {
    return {
        width: parseUnitSizeLayout(model, channel_1.X),
        height: parseUnitSizeLayout(model, channel_1.Y)
    };
}
exports.parseUnitLayout = parseUnitLayout;
function parseUnitSizeLayout(model, channel) {
    var cellConfig = model.config().cell;
    var nonOrdinalSize = channel === channel_1.X ? cellConfig.width : cellConfig.height;
    return {
        distinct: getDistinct(model, channel),
        formula: [{
                field: model.channelSizeName(channel),
                expr: unitSizeExpr(model, channel, nonOrdinalSize)
            }]
    };
}
function unitSizeExpr(model, channel, nonOrdinalSize) {
    if (model.scale(channel)) {
        if (model.isOrdinalScale(channel)) {
            var scale = model.scale(channel);
            return '(' + cardinalityFormula(model, channel) +
                ' + ' + scale.padding +
                ') * ' + scale.bandSize;
        }
        else {
            return nonOrdinalSize + '';
        }
    }
    else {
        if (model.mark() === mark_1.TEXT && channel === channel_1.X) {
            return model.config().scale.textBandWidth + '';
        }
        return model.config().scale.bandSize + '';
    }
}
function parseFacetLayout(model) {
    return {
        width: parseFacetSizeLayout(model, channel_1.COLUMN),
        height: parseFacetSizeLayout(model, channel_1.ROW)
    };
}
exports.parseFacetLayout = parseFacetLayout;
function parseFacetSizeLayout(model, channel) {
    var childLayoutComponent = model.child().component.layout;
    var sizeType = channel === channel_1.ROW ? 'height' : 'width';
    var childSizeComponent = childLayoutComponent[sizeType];
    if (true) {
        var distinct = util_1.extend(getDistinct(model, channel), childSizeComponent.distinct);
        var formula = childSizeComponent.formula.concat([{
                field: model.channelSizeName(channel),
                expr: facetSizeFormula(model, channel, model.child().channelSizeName(channel))
            }]);
        delete childLayoutComponent[sizeType];
        return {
            distinct: distinct,
            formula: formula
        };
    }
}
function facetSizeFormula(model, channel, innerSize) {
    var scale = model.scale(channel);
    if (model.has(channel)) {
        return '(datum.' + innerSize + ' + ' + scale.padding + ')' + ' * ' + cardinalityFormula(model, channel);
    }
    else {
        return 'datum.' + innerSize + ' + ' + model.config().facet.scale.padding;
    }
}
function parseLayerLayout(model) {
    return {
        width: parseLayerSizeLayout(model, channel_1.X),
        height: parseLayerSizeLayout(model, channel_1.Y)
    };
}
exports.parseLayerLayout = parseLayerLayout;
function parseLayerSizeLayout(model, channel) {
    if (true) {
        var childLayoutComponent = model.children()[0].component.layout;
        var sizeType_1 = channel === channel_1.Y ? 'height' : 'width';
        var childSizeComponent = childLayoutComponent[sizeType_1];
        var distinct = childSizeComponent.distinct;
        var formula = [{
                field: model.channelSizeName(channel),
                expr: childSizeComponent.formula[0].expr
            }];
        model.children().forEach(function (child) {
            delete child.component.layout[sizeType_1];
        });
        return {
            distinct: distinct,
            formula: formula
        };
    }
}
function getDistinct(model, channel) {
    if (model.has(channel) && model.isOrdinalScale(channel)) {
        var scale = model.scale(channel);
        if (scale.type === scale_1.ScaleType.ORDINAL && !(scale.domain instanceof Array)) {
            var distinctField = model.field(channel);
            var distinct = {};
            distinct[distinctField] = true;
            return distinct;
        }
    }
    return {};
}
function cardinalityFormula(model, channel) {
    var scale = model.scale(channel);
    if (scale.domain instanceof Array) {
        return scale.domain.length;
    }
    var timeUnit = model.fieldDef(channel).timeUnit;
    var timeUnitDomain = timeUnit ? time_1.rawDomain(timeUnit, channel) : null;
    return timeUnitDomain !== null ? timeUnitDomain.length :
        model.field(channel, { datum: true, prefn: 'distinct_' });
}
//# sourceMappingURL=layout.js.map

/***/ }),

/***/ "YGNx":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
  type = __webpack_require__("ggRp"),
  formats = __webpack_require__("nIY2"),
  timeF = __webpack_require__("GXhC").time;

function read(data, format) {
  var type = (format && format.type) || 'json';
  data = formats[type](data, format);
  if (format && format.parse) parse(data, format.parse);
  return data;
}

function parse(data, types) {
  var cols, parsers, d, i, j, clen, len = data.length;

  types = (types==='auto') ? type.inferAll(data) : util.duplicate(types);
  cols = util.keys(types);
  parsers = cols.map(function(c) {
    var t = types[c];
    if (t && t.indexOf('date:') === 0) {
      var parts = t.split(/:(.+)?/, 2),  // split on first :
          pattern = parts[1];
      if ((pattern[0] === '\'' && pattern[pattern.length-1] === '\'') ||
          (pattern[0] === '"'  && pattern[pattern.length-1] === '"')) {
        pattern = pattern.slice(1, -1);
      } else {
        throw Error('Format pattern must be quoted: ' + pattern);
      }
      pattern = timeF(pattern);
      return function(v) { return pattern.parse(v); };
    }
    if (!type.parsers[t]) {
      throw Error('Illegal format pattern: ' + c + ':' + t);
    }
    return type.parsers[t];
  });

  for (i=0, clen=cols.length; i<len; ++i) {
    d = data[i];
    for (j=0; j<clen; ++j) {
      d[cols[j]] = parsers[j](d[cols[j]]);
    }
  }
  type.annotation(data, types);
}

read.formats = formats;
module.exports = read;


/***/ }),

/***/ "YX8j":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    vg = __webpack_require__("YzNj"),
    vl = __webpack_require__("wWYS"),
    parameter = __webpack_require__("rVSZ"),
    post = __webpack_require__("RA6T");

var config = {
  // URL for loading specs into editor
  editor_url: 'http://vega.github.io/vega-editor/',

  // HTML to inject within view source head element
  source_header: '',

  // HTML to inject before view source closing body tag
  source_footer: ''
};

var MODES = {
  'vega':      'vega',
  'vega-lite': 'vega-lite'
};

var PREPROCESSOR = {
  'vega':      function(vgjson) { return vgjson; },
  'vega-lite': function(vljson) { return vl.compile(vljson).spec; }
};

function load(url, arg, prop, el, callback) {
  vg.util.load({url: url}, function(err, data) {
    var opt;
    if (err || !data) {
      console.error(err || ('No data found at ' + url));
    } else {
      // marshal embedding spec and restart
      if (!arg) { // Loading embed spec from URL
        opt = JSON.parse(data);
      } else {  // Loading vg/vl spec or config from URL
        opt = vg.util.extend({}, arg);
        opt[prop] = prop === 'source' ? data : JSON.parse(data);
      }
      embed(el, opt, callback);
    }
  });
}

// Embed a Vega visualization component in a web page.
// el: DOM element in which to place component (DOM node or CSS selector)
// opt: Embedding specification (parsed JSON or URL string)
// callback: invoked with the generated Vega View instance
function embed(el, opt, callback) {
  var cb = callback || function(){},
      params = [], source, spec, mode, config;

  try {
    // Load the visualization specification.
    if (vg.util.isString(opt)) {
      return load(opt, null, null, el, callback);
    } else if (opt.source) {
      source = opt.source;
      spec = JSON.parse(source);
    } else if (opt.spec) {
      spec = opt.spec;
      source = JSON.stringify(spec, null, 2);
    } else if (opt.url) {
      return load(opt.url, opt, 'source', el, callback);
    } else {
      spec = opt;
      source = JSON.stringify(spec, null, 2);
      opt = {spec: spec, actions: false};
    }
    mode = MODES[opt.mode] || MODES.vega;
    spec = PREPROCESSOR[mode](spec);

    // Load Vega theme/configuration.
    if (vg.util.isString(opt.config)) {
      return load(opt.config, opt, 'config', el, callback);
    } else if (opt.config) {
      config = opt.config;
    }

    // ensure container div has class 'vega-embed'
    var div = d3.select(el)
      .classed('vega-embed', true)
      .html(''); // clear container

    // handle parameters
    if (opt.parameters) {
      var elp = opt.parameter_el ? d3.select(opt.parameter_el) : div;
      var pdiv = elp.append('div')
        .attr('class', 'vega-params');
      params = opt.parameters.map(function(p) {
        return parameter.init(pdiv, p, spec);
      });
    }
  } catch (err) { cb(err); }

  vg.parse.spec(spec, config, function(error, chart) {
    if (error) { cb(error); return; }
    try {
      var renderer = opt.renderer || 'canvas',
          actions  = opt.actions || {};

      var view = chart({
        el: el,
        data: opt.data || undefined,
        renderer: renderer
      });

      if (opt.actions !== false) {
        // add child div to house action links
        var ctrl = div.append('div')
          .attr('class', 'vega-actions');

        // add 'Export' action
        if (actions.export !== false) {
          var ext = (renderer==='canvas' ? 'png' : 'svg');
          ctrl.append('a')
            .text('Export as ' + ext.toUpperCase())
            .attr('href', '#')
            .attr('target', '_blank')
            .attr('download', (spec.name || 'vega') + '.' + ext)
            .on('mousedown', function() {
              this.href = view.toImageURL(ext);
              d3.event.preventDefault();
            });
        }

        // add 'View Source' action
        if (actions.source !== false) {
          ctrl.append('a')
            .text('View Source')
            .attr('href', '#')
            .on('click', function() {
              viewSource(source);
              d3.event.preventDefault();
            });
        }

        // add 'Open in Vega Editor' action
        if (actions.editor !== false) {
          ctrl.append('a')
            .text('Open in Vega Editor')
            .attr('href', '#')
            .on('click', function() {
              post(window, embed.config.editor_url, {spec: source, mode: mode});
              d3.event.preventDefault();
            });
        }
      }

      // bind all parameter elements
      params.forEach(function(p) { parameter.bind(p, view); });

      // initialize and return visualization
      view.update();
      cb(null, {view: view, spec: spec});
    } catch (err) { cb(err); }
  });
}

function viewSource(source) {
  var header = '<html><head>' + config.source_header + '</head>' + '<body><pre><code class="json">';
  var footer = '</code></pre>' + config.source_footer + '</body></html>';
  var win = window.open('');
  win.document.write(header + source + footer);
  win.document.title = 'Vega JSON Source';
}

// make config externally visible
embed.config = config;

module.exports = embed;


/***/ }),

/***/ "YsQl":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    gen = module.exports;

gen.repeat = function(val, n) {
  var a = Array(n), i;
  for (i=0; i<n; ++i) a[i] = val;
  return a;
};

gen.zeros = function(n) {
  return gen.repeat(0, n);
};

gen.range = function(start, stop, step) {
  if (arguments.length < 3) {
    step = 1;
    if (arguments.length < 2) {
      stop = start;
      start = 0;
    }
  }
  if ((stop - start) / step == Infinity) throw new Error('Infinite range');
  var range = [], i = -1, j;
  if (step < 0) while ((j = start + step * ++i) > stop) range.push(j);
  else while ((j = start + step * ++i) < stop) range.push(j);
  return range;
};

gen.random = {};

gen.random.uniform = function(min, max) {
  if (max === undefined) {
    max = min === undefined ? 1 : min;
    min = 0;
  }
  var d = max - min;
  var f = function() {
    return min + d * Math.random();
  };
  f.samples = function(n) {
    return gen.zeros(n).map(f);
  };
  f.pdf = function(x) {
    return (x >= min && x <= max) ? 1/d : 0;
  };
  f.cdf = function(x) {
    return x < min ? 0 : x > max ? 1 : (x - min) / d;
  };
  f.icdf = function(p) {
    return (p >= 0 && p <= 1) ? min + p*d : NaN;
  };
  return f;
};

gen.random.integer = function(a, b) {
  if (b === undefined) {
    b = a;
    a = 0;
  }
  var d = b - a;
  var f = function() {
    return a + Math.floor(d * Math.random());
  };
  f.samples = function(n) {
    return gen.zeros(n).map(f);
  };
  f.pdf = function(x) {
    return (x === Math.floor(x) && x >= a && x < b) ? 1/d : 0;
  };
  f.cdf = function(x) {
    var v = Math.floor(x);
    return v < a ? 0 : v >= b ? 1 : (v - a + 1) / d;
  };
  f.icdf = function(p) {
    return (p >= 0 && p <= 1) ? a - 1 + Math.floor(p*d) : NaN;
  };
  return f;
};

gen.random.normal = function(mean, stdev) {
  mean = mean || 0;
  stdev = stdev || 1;
  var next;
  var f = function() {
    var x = 0, y = 0, rds, c;
    if (next !== undefined) {
      x = next;
      next = undefined;
      return x;
    }
    do {
      x = Math.random()*2-1;
      y = Math.random()*2-1;
      rds = x*x + y*y;
    } while (rds === 0 || rds > 1);
    c = Math.sqrt(-2*Math.log(rds)/rds); // Box-Muller transform
    next = mean + y*c*stdev;
    return mean + x*c*stdev;
  };
  f.samples = function(n) {
    return gen.zeros(n).map(f);
  };
  f.pdf = function(x) {
    var exp = Math.exp(Math.pow(x-mean, 2) / (-2 * Math.pow(stdev, 2)));
    return (1 / (stdev * Math.sqrt(2*Math.PI))) * exp;
  };
  f.cdf = function(x) {
    // Approximation from West (2009)
    // Better Approximations to Cumulative Normal Functions
    var cd,
        z = (x - mean) / stdev,
        Z = Math.abs(z);
    if (Z > 37) {
      cd = 0;
    } else {
      var sum, exp = Math.exp(-Z*Z/2);
      if (Z < 7.07106781186547) {
        sum = 3.52624965998911e-02 * Z + 0.700383064443688;
        sum = sum * Z + 6.37396220353165;
        sum = sum * Z + 33.912866078383;
        sum = sum * Z + 112.079291497871;
        sum = sum * Z + 221.213596169931;
        sum = sum * Z + 220.206867912376;
        cd = exp * sum;
        sum = 8.83883476483184e-02 * Z + 1.75566716318264;
        sum = sum * Z + 16.064177579207;
        sum = sum * Z + 86.7807322029461;
        sum = sum * Z + 296.564248779674;
        sum = sum * Z + 637.333633378831;
        sum = sum * Z + 793.826512519948;
        sum = sum * Z + 440.413735824752;
        cd = cd / sum;
      } else {
        sum = Z + 0.65;
        sum = Z + 4 / sum;
        sum = Z + 3 / sum;
        sum = Z + 2 / sum;
        sum = Z + 1 / sum;
        cd = exp / sum / 2.506628274631;
      }
    }
    return z > 0 ? 1 - cd : cd;
  };
  f.icdf = function(p) {
    // Approximation of Probit function using inverse error function.
    if (p <= 0 || p >= 1) return NaN;
    var x = 2*p - 1,
        v = (8 * (Math.PI - 3)) / (3 * Math.PI * (4-Math.PI)),
        a = (2 / (Math.PI*v)) + (Math.log(1 - Math.pow(x,2)) / 2),
        b = Math.log(1 - (x*x)) / v,
        s = (x > 0 ? 1 : -1) * Math.sqrt(Math.sqrt((a*a) - b) - a);
    return mean + stdev * Math.SQRT2 * s;
  };
  return f;
};

gen.random.bootstrap = function(domain, smooth) {
  // Generates a bootstrap sample from a set of observations.
  // Smooth bootstrapping adds random zero-centered noise to the samples.
  var val = domain.filter(util.isValid),
      len = val.length,
      err = smooth ? gen.random.normal(0, smooth) : null;
  var f = function() {
    return val[~~(Math.random()*len)] + (err ? err() : 0);
  };
  f.samples = function(n) {
    return gen.zeros(n).map(f);
  };
  return f;
};

/***/ }),

/***/ "YvtE":
/***/ (function(module, exports) {

module.exports = function(def, config, property, defaultVal) {
  if (def[property] !== undefined) {
    return def[property];
  } else if (config !== undefined && config[property] !== undefined) {
    return config[property];
  } else if (defaultVal !== undefined) {
    return defaultVal;
  }
  return undefined;
};

/***/ }),

/***/ "YzNj":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  version: '__VERSION__',
  dataflow: __webpack_require__("Hqva"),
  parse: __webpack_require__("UaGl"),
  scene: {
    Bounder: __webpack_require__("rnWk"),
    Builder: __webpack_require__("Vp7n"),
    Encoder: __webpack_require__("XVii"),
    GroupBuilder: __webpack_require__("BB2X"),
    visit: __webpack_require__("Qpkz")
  },
  transforms: __webpack_require__("C8zq"),
  Transform: __webpack_require__("4JPs"),
  BatchTransform: __webpack_require__("acp7"),
  Parameter: __webpack_require__("fRRI"),
  schema: __webpack_require__("CiyH"),
  config: __webpack_require__("8NMF"),
  util: __webpack_require__("v0Fq"),
  logging: __webpack_require__("J731"),
  debug: __webpack_require__("J731").debug
};


/***/ }),

/***/ "Z8XL":
/***/ (function(module, exports, __webpack_require__) {

var json = __webpack_require__("cwb4");

var reader = function(data, format) {
  var topojson = reader.topojson;
  if (topojson == null) { throw Error('TopoJSON library not loaded.'); }

  var t = json(data, format), obj;

  if (format && format.feature) {
    if ((obj = t.objects[format.feature])) {
      return topojson.feature(t, obj).features;
    } else {
      throw Error('Invalid TopoJSON object: ' + format.feature);
    }
  } else if (format && format.mesh) {
    if ((obj = t.objects[format.mesh])) {
      return [topojson.mesh(t, t.objects[format.mesh])];
    } else {
      throw Error('Invalid TopoJSON object: ' + format.mesh);
    }
  } else {
    throw Error('Missing TopoJSON feature or mesh parameter.');
  }
};

reader.topojson = __webpack_require__("nTOs");
module.exports = reader;


/***/ }),

/***/ "ZAUf":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var stringify = __webpack_require__("EbtV");
var util_1 = __webpack_require__("zF6n");
exports.keys = util_1.keys;
exports.extend = util_1.extend;
exports.duplicate = util_1.duplicate;
exports.isArray = util_1.isArray;
exports.vals = util_1.vals;
exports.truncate = util_1.truncate;
exports.toMap = util_1.toMap;
exports.isObject = util_1.isObject;
exports.isString = util_1.isString;
exports.isNumber = util_1.isNumber;
exports.isBoolean = util_1.isBoolean;
var util_2 = __webpack_require__("zF6n");
var generate_1 = __webpack_require__("YsQl");
exports.range = generate_1.range;
var encoding_1 = __webpack_require__("QSMf");
exports.has = encoding_1.has;
var channel_1 = __webpack_require__("P/aK");
exports.Channel = channel_1.Channel;
var util_3 = __webpack_require__("zF6n");
function pick(obj, props) {
    var copy = {};
    props.forEach(function (prop) {
        if (obj.hasOwnProperty(prop)) {
            copy[prop] = obj[prop];
        }
    });
    return copy;
}
exports.pick = pick;
function omit(obj, props) {
    var copy = util_2.duplicate(obj);
    props.forEach(function (prop) {
        delete copy[prop];
    });
    return copy;
}
exports.omit = omit;
function hash(a) {
    if (util_3.isString(a) || util_3.isNumber(a) || util_3.isBoolean(a)) {
        return String(a);
    }
    return stringify(a);
}
exports.hash = hash;
function contains(array, item) {
    return array.indexOf(item) > -1;
}
exports.contains = contains;
function without(array, excludedItems) {
    return array.filter(function (item) {
        return !contains(excludedItems, item);
    });
}
exports.without = without;
function union(array, other) {
    return array.concat(without(other, array));
}
exports.union = union;
function forEach(obj, f, thisArg) {
    if (obj.forEach) {
        obj.forEach.call(thisArg, f);
    }
    else {
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                f.call(thisArg, obj[k], k, obj);
            }
        }
    }
}
exports.forEach = forEach;
function reduce(obj, f, init, thisArg) {
    if (obj.reduce) {
        return obj.reduce.call(thisArg, f, init);
    }
    else {
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                init = f.call(thisArg, init, obj[k], k, obj);
            }
        }
        return init;
    }
}
exports.reduce = reduce;
function map(obj, f, thisArg) {
    if (obj.map) {
        return obj.map.call(thisArg, f);
    }
    else {
        var output = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                output.push(f.call(thisArg, obj[k], k, obj));
            }
        }
        return output;
    }
}
exports.map = map;
function some(arr, f) {
    var i = 0;
    for (var k = 0; k < arr.length; k++) {
        if (f(arr[k], k, i++)) {
            return true;
        }
    }
    return false;
}
exports.some = some;
function every(arr, f) {
    var i = 0;
    for (var k = 0; k < arr.length; k++) {
        if (!f(arr[k], k, i++)) {
            return false;
        }
    }
    return true;
}
exports.every = every;
function flatten(arrays) {
    return [].concat.apply([], arrays);
}
exports.flatten = flatten;
function mergeDeep(dest) {
    var src = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        src[_i - 1] = arguments[_i];
    }
    for (var i = 0; i < src.length; i++) {
        dest = deepMerge_(dest, src[i]);
    }
    return dest;
}
exports.mergeDeep = mergeDeep;
;
function deepMerge_(dest, src) {
    if (typeof src !== 'object' || src === null) {
        return dest;
    }
    for (var p in src) {
        if (!src.hasOwnProperty(p)) {
            continue;
        }
        if (src[p] === undefined) {
            continue;
        }
        if (typeof src[p] !== 'object' || src[p] === null) {
            dest[p] = src[p];
        }
        else if (typeof dest[p] !== 'object' || dest[p] === null) {
            dest[p] = mergeDeep(src[p].constructor === Array ? [] : {}, src[p]);
        }
        else {
            mergeDeep(dest[p], src[p]);
        }
    }
    return dest;
}
var dlBin = __webpack_require__("prMK");
function getbins(stats, maxbins) {
    return dlBin({
        min: stats.min,
        max: stats.max,
        maxbins: maxbins
    });
}
exports.getbins = getbins;
function unique(values, f) {
    var results = [];
    var u = {}, v, i, n;
    for (i = 0, n = values.length; i < n; ++i) {
        v = f ? f(values[i]) : values[i];
        if (v in u) {
            continue;
        }
        u[v] = 1;
        results.push(values[i]);
    }
    return results;
}
exports.unique = unique;
;
function warning(message) {
    console.warn('[VL Warning]', message);
}
exports.warning = warning;
function error(message) {
    console.error('[VL Error]', message);
}
exports.error = error;
function differ(dict, other) {
    for (var key in dict) {
        if (dict.hasOwnProperty(key)) {
            if (other[key] && dict[key] && other[key] !== dict[key]) {
                return true;
            }
        }
    }
    return false;
}
exports.differ = differ;
//# sourceMappingURL=util.js.map

/***/ }),

/***/ "ZCPb":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/"),
    EMPTY = [];

function draw(g, scene, bounds) {
  if (!scene.items || !scene.items.length) return;

  var groups = scene.items,
      renderer = this,
      group, items, axes, legends, gx, gy, w, h, opac, i, n, j, m;

  for (i=0, n=groups.length; i<n; ++i) {
    group = groups[i];
    axes = group.axisItems || EMPTY;
    items = group.items || EMPTY;
    legends = group.legendItems || EMPTY;
    gx = group.x || 0;
    gy = group.y || 0;
    w = group.width || 0;
    h = group.height || 0;

    // draw group background
    if (group.stroke || group.fill) {
      opac = group.opacity == null ? 1 : group.opacity;
      if (opac > 0) {
        if (group.fill && util.fill(g, group, opac)) {
          g.fillRect(gx, gy, w, h);
        }
        if (group.stroke && util.stroke(g, group, opac)) {
          g.strokeRect(gx, gy, w, h);
        }
      }
    }

    // setup graphics context
    g.save();
    g.translate(gx, gy);
    if (group.clip) {
      g.beginPath();
      g.rect(0, 0, w, h);
      g.clip();
    }
    if (bounds) bounds.translate(-gx, -gy);

    // draw group contents
    for (j=0, m=axes.length; j<m; ++j) {
      if (axes[j].layer === 'back') {
        renderer.draw(g, axes[j], bounds);
      }
    }
    for (j=0, m=items.length; j<m; ++j) {
      renderer.draw(g, items[j], bounds);
    }
    for (j=0, m=axes.length; j<m; ++j) {
      if (axes[j].layer !== 'back') {
        renderer.draw(g, axes[j], bounds);
      }
    }
    for (j=0, m=legends.length; j<m; ++j) {
      renderer.draw(g, legends[j], bounds);
    }

    // restore graphics context
    if (bounds) bounds.translate(gx, gy);
    g.restore();
  }    
}

function pick(g, scene, x, y, gx, gy) {
  if (scene.bounds && !scene.bounds.contains(gx, gy)) {
    return null;
  }

  var groups = scene.items || EMPTY, subscene,
      group, axes, items, legends, hits, dx, dy, i, j, b;

  for (i=groups.length; --i>=0;) {
    group = groups[i];

    // first hit test against bounding box
    // if a group is clipped, that should be handled by the bounds check.
    b = group.bounds;
    if (b && !b.contains(gx, gy)) continue;

    // passed bounds check, so test sub-groups
    axes = group.axisItems || EMPTY;
    items = group.items || EMPTY;
    legends = group.legendItems || EMPTY;
    dx = (group.x || 0);
    dy = (group.y || 0);

    g.save();
    g.translate(dx, dy);
    dx = gx - dx;
    dy = gy - dy;
    for (j=legends.length; --j>=0;) {
      subscene = legends[j];
      if (subscene.interactive !== false) {
        hits = this.pick(subscene, x, y, dx, dy);
        if (hits) { g.restore(); return hits; }
      }
    }
    for (j=axes.length; --j>=0;) {
      subscene = axes[j];
      if (subscene.interactive !== false && subscene.layer !== 'back') {
        hits = this.pick(subscene, x, y, dx, dy);
        if (hits) { g.restore(); return hits; }
      }
    }
    for (j=items.length; --j>=0;) {
      subscene = items[j];
      if (subscene.interactive !== false) {
        hits = this.pick(subscene, x, y, dx, dy);
        if (hits) { g.restore(); return hits; }
      }
    }
    for (j=axes.length; --j>=0;) {
      subscene = axes[j];
      if (subscene.interative !== false && subscene.layer === 'back') {
        hits = this.pick(subscene, x, y, dx, dy);
        if (hits) { g.restore(); return hits; }
      }
    }
    g.restore();

    if (scene.interactive !== false && (group.fill || group.stroke) &&
        dx >= 0 && dx <= group.width && dy >= 0 && dy <= group.height) {
      return group;
    }
  }

  return null;
}

module.exports = {
  draw: draw,
  pick: pick
};


/***/ }),

/***/ "ZE31":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

exports.defaultLegendConfig = {
    orient: undefined,
    shortTimeLabels: false
};
//# sourceMappingURL=legend.js.map

/***/ }),

/***/ "ZyfV":
/***/ (function(module, exports) {

function Renderer() {
  this._el = null;
  this._bgcolor = null;
}

var prototype = Renderer.prototype;

prototype.initialize = function(el, width, height, padding) {
  this._el = el;
  return this.resize(width, height, padding);
};

// Returns the parent container element for a visualization
prototype.element = function() {
  return this._el;
};

// Returns the scene element (e.g., canvas or SVG) of the visualization
// Subclasses must override if the first child is not the scene element
prototype.scene = function() {
  return this._el && this._el.firstChild;
};

prototype.background = function(bgcolor) {
  if (arguments.length === 0) return this._bgcolor;
  this._bgcolor = bgcolor;
  return this;
};

prototype.resize = function(width, height, padding) {
  this._width = width;
  this._height = height;
  this._padding = padding || {top:0, left:0, bottom:0, right:0};
  return this;
};

prototype.render = function(/*scene, items*/) {
  return this;
};

module.exports = Renderer;

/***/ }),

/***/ "aZ75":
/***/ (function(module, exports, __webpack_require__) {

(function (global, factory) {
   true ? factory(exports) :
  typeof define === 'function' && define.amd ? define('d3-time', ['exports'], factory) :
  factory((global.d3_time = {}));
}(this, function (exports) { 'use strict';

  var t0 = new Date;
  var t1 = new Date;
  function newInterval(floori, offseti, count, field) {

    function interval(date) {
      return floori(date = new Date(+date)), date;
    }

    interval.floor = interval;

    interval.round = function(date) {
      var d0 = new Date(+date),
          d1 = new Date(date - 1);
      floori(d0), floori(d1), offseti(d1, 1);
      return date - d0 < d1 - date ? d0 : d1;
    };

    interval.ceil = function(date) {
      return floori(date = new Date(date - 1)), offseti(date, 1), date;
    };

    interval.offset = function(date, step) {
      return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
    };

    interval.range = function(start, stop, step) {
      var range = [];
      start = new Date(start - 1);
      stop = new Date(+stop);
      step = step == null ? 1 : Math.floor(step);
      if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
      offseti(start, 1), floori(start);
      if (start < stop) range.push(new Date(+start));
      while (offseti(start, step), floori(start), start < stop) range.push(new Date(+start));
      return range;
    };

    interval.filter = function(test) {
      return newInterval(function(date) {
        while (floori(date), !test(date)) date.setTime(date - 1);
      }, function(date, step) {
        while (--step >= 0) while (offseti(date, 1), !test(date));
      });
    };

    if (count) {
      interval.count = function(start, end) {
        t0.setTime(+start), t1.setTime(+end);
        floori(t0), floori(t1);
        return Math.floor(count(t0, t1));
      };

      interval.every = function(step) {
        step = Math.floor(step);
        return !isFinite(step) || !(step > 0) ? null
            : !(step > 1) ? interval
            : interval.filter(field
                ? function(d) { return field(d) % step === 0; }
                : function(d) { return interval.count(0, d) % step === 0; });
      };
    }

    return interval;
  };

  var millisecond = newInterval(function() {
    // noop
  }, function(date, step) {
    date.setTime(+date + step);
  }, function(start, end) {
    return end - start;
  });

  // An optimized implementation for this simple case.
  millisecond.every = function(k) {
    k = Math.floor(k);
    if (!isFinite(k) || !(k > 0)) return null;
    if (!(k > 1)) return millisecond;
    return newInterval(function(date) {
      date.setTime(Math.floor(date / k) * k);
    }, function(date, step) {
      date.setTime(+date + step * k);
    }, function(start, end) {
      return (end - start) / k;
    });
  };

  var second = newInterval(function(date) {
    date.setMilliseconds(0);
  }, function(date, step) {
    date.setTime(+date + step * 1e3);
  }, function(start, end) {
    return (end - start) / 1e3;
  }, function(date) {
    return date.getSeconds();
  });

  var minute = newInterval(function(date) {
    date.setSeconds(0, 0);
  }, function(date, step) {
    date.setTime(+date + step * 6e4);
  }, function(start, end) {
    return (end - start) / 6e4;
  }, function(date) {
    return date.getMinutes();
  });

  var hour = newInterval(function(date) {
    date.setMinutes(0, 0, 0);
  }, function(date, step) {
    date.setTime(+date + step * 36e5);
  }, function(start, end) {
    return (end - start) / 36e5;
  }, function(date) {
    return date.getHours();
  });

  var day = newInterval(function(date) {
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setDate(date.getDate() + step);
  }, function(start, end) {
    return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * 6e4) / 864e5;
  }, function(date) {
    return date.getDate() - 1;
  });

  function weekday(i) {
    return newInterval(function(date) {
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
    }, function(date, step) {
      date.setDate(date.getDate() + step * 7);
    }, function(start, end) {
      return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * 6e4) / 6048e5;
    });
  }

  var sunday = weekday(0);
  var monday = weekday(1);
  var tuesday = weekday(2);
  var wednesday = weekday(3);
  var thursday = weekday(4);
  var friday = weekday(5);
  var saturday = weekday(6);

  var month = newInterval(function(date) {
    date.setHours(0, 0, 0, 0);
    date.setDate(1);
  }, function(date, step) {
    date.setMonth(date.getMonth() + step);
  }, function(start, end) {
    return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
  }, function(date) {
    return date.getMonth();
  });

  var year = newInterval(function(date) {
    date.setHours(0, 0, 0, 0);
    date.setMonth(0, 1);
  }, function(date, step) {
    date.setFullYear(date.getFullYear() + step);
  }, function(start, end) {
    return end.getFullYear() - start.getFullYear();
  }, function(date) {
    return date.getFullYear();
  });

  var utcSecond = newInterval(function(date) {
    date.setUTCMilliseconds(0);
  }, function(date, step) {
    date.setTime(+date + step * 1e3);
  }, function(start, end) {
    return (end - start) / 1e3;
  }, function(date) {
    return date.getUTCSeconds();
  });

  var utcMinute = newInterval(function(date) {
    date.setUTCSeconds(0, 0);
  }, function(date, step) {
    date.setTime(+date + step * 6e4);
  }, function(start, end) {
    return (end - start) / 6e4;
  }, function(date) {
    return date.getUTCMinutes();
  });

  var utcHour = newInterval(function(date) {
    date.setUTCMinutes(0, 0, 0);
  }, function(date, step) {
    date.setTime(+date + step * 36e5);
  }, function(start, end) {
    return (end - start) / 36e5;
  }, function(date) {
    return date.getUTCHours();
  });

  var utcDay = newInterval(function(date) {
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCDate(date.getUTCDate() + step);
  }, function(start, end) {
    return (end - start) / 864e5;
  }, function(date) {
    return date.getUTCDate() - 1;
  });

  function utcWeekday(i) {
    return newInterval(function(date) {
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
    }, function(date, step) {
      date.setUTCDate(date.getUTCDate() + step * 7);
    }, function(start, end) {
      return (end - start) / 6048e5;
    });
  }

  var utcSunday = utcWeekday(0);
  var utcMonday = utcWeekday(1);
  var utcTuesday = utcWeekday(2);
  var utcWednesday = utcWeekday(3);
  var utcThursday = utcWeekday(4);
  var utcFriday = utcWeekday(5);
  var utcSaturday = utcWeekday(6);

  var utcMonth = newInterval(function(date) {
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(1);
  }, function(date, step) {
    date.setUTCMonth(date.getUTCMonth() + step);
  }, function(start, end) {
    return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
  }, function(date) {
    return date.getUTCMonth();
  });

  var utcYear = newInterval(function(date) {
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCMonth(0, 1);
  }, function(date, step) {
    date.setUTCFullYear(date.getUTCFullYear() + step);
  }, function(start, end) {
    return end.getUTCFullYear() - start.getUTCFullYear();
  }, function(date) {
    return date.getUTCFullYear();
  });

  var milliseconds = millisecond.range;
  var seconds = second.range;
  var minutes = minute.range;
  var hours = hour.range;
  var days = day.range;
  var sundays = sunday.range;
  var mondays = monday.range;
  var tuesdays = tuesday.range;
  var wednesdays = wednesday.range;
  var thursdays = thursday.range;
  var fridays = friday.range;
  var saturdays = saturday.range;
  var weeks = sunday.range;
  var months = month.range;
  var years = year.range;

  var utcMillisecond = millisecond;
  var utcMilliseconds = milliseconds;
  var utcSeconds = utcSecond.range;
  var utcMinutes = utcMinute.range;
  var utcHours = utcHour.range;
  var utcDays = utcDay.range;
  var utcSundays = utcSunday.range;
  var utcMondays = utcMonday.range;
  var utcTuesdays = utcTuesday.range;
  var utcWednesdays = utcWednesday.range;
  var utcThursdays = utcThursday.range;
  var utcFridays = utcFriday.range;
  var utcSaturdays = utcSaturday.range;
  var utcWeeks = utcSunday.range;
  var utcMonths = utcMonth.range;
  var utcYears = utcYear.range;

  var version = "0.1.1";

  exports.version = version;
  exports.milliseconds = milliseconds;
  exports.seconds = seconds;
  exports.minutes = minutes;
  exports.hours = hours;
  exports.days = days;
  exports.sundays = sundays;
  exports.mondays = mondays;
  exports.tuesdays = tuesdays;
  exports.wednesdays = wednesdays;
  exports.thursdays = thursdays;
  exports.fridays = fridays;
  exports.saturdays = saturdays;
  exports.weeks = weeks;
  exports.months = months;
  exports.years = years;
  exports.utcMillisecond = utcMillisecond;
  exports.utcMilliseconds = utcMilliseconds;
  exports.utcSeconds = utcSeconds;
  exports.utcMinutes = utcMinutes;
  exports.utcHours = utcHours;
  exports.utcDays = utcDays;
  exports.utcSundays = utcSundays;
  exports.utcMondays = utcMondays;
  exports.utcTuesdays = utcTuesdays;
  exports.utcWednesdays = utcWednesdays;
  exports.utcThursdays = utcThursdays;
  exports.utcFridays = utcFridays;
  exports.utcSaturdays = utcSaturdays;
  exports.utcWeeks = utcWeeks;
  exports.utcMonths = utcMonths;
  exports.utcYears = utcYears;
  exports.millisecond = millisecond;
  exports.second = second;
  exports.minute = minute;
  exports.hour = hour;
  exports.day = day;
  exports.sunday = sunday;
  exports.monday = monday;
  exports.tuesday = tuesday;
  exports.wednesday = wednesday;
  exports.thursday = thursday;
  exports.friday = friday;
  exports.saturday = saturday;
  exports.week = sunday;
  exports.month = month;
  exports.year = year;
  exports.utcSecond = utcSecond;
  exports.utcMinute = utcMinute;
  exports.utcHour = utcHour;
  exports.utcDay = utcDay;
  exports.utcSunday = utcSunday;
  exports.utcMonday = utcMonday;
  exports.utcTuesday = utcTuesday;
  exports.utcWednesday = utcWednesday;
  exports.utcThursday = utcThursday;
  exports.utcFriday = utcFriday;
  exports.utcSaturday = utcSaturday;
  exports.utcWeek = utcSunday;
  exports.utcMonth = utcMonth;
  exports.utcYear = utcYear;
  exports.interval = newInterval;

}));

/***/ }),

/***/ "acp7":
/***/ (function(module, exports, __webpack_require__) {

var Base = __webpack_require__("4JPs").prototype;

function BatchTransform() {
  // Nearest appropriate collector.
  // Set by the dataflow Graph during connection.
  this._collector = null;
}

var prototype = (BatchTransform.prototype = Object.create(Base));
prototype.constructor = BatchTransform;

prototype.init = function(graph) {
  Base.init.call(this, graph);
  return this.batch(true);
};

prototype.transform = function(input, reset) {
  return this.batchTransform(input, this._collector.data(), reset);
};

prototype.batchTransform = function(/* input, data, reset */) {
};

module.exports = BatchTransform;


/***/ }),

/***/ "bSC/":
/***/ (function(module, exports, __webpack_require__) {

var arc = __webpack_require__("/MHv");

module.exports = function(g, path, l, t) {
  var current, // current instruction
      previous = null,
      x = 0, // current x
      y = 0, // current y
      controlX = 0, // current control point x
      controlY = 0, // current control point y
      tempX,
      tempY,
      tempControlX,
      tempControlY;

  if (l == null) l = 0;
  if (t == null) t = 0;

  g.beginPath();

  for (var i=0, len=path.length; i<len; ++i) {
    current = path[i];

    switch (current[0]) { // first letter

      case 'l': // lineto, relative
        x += current[1];
        y += current[2];
        g.lineTo(x + l, y + t);
        break;

      case 'L': // lineto, absolute
        x = current[1];
        y = current[2];
        g.lineTo(x + l, y + t);
        break;

      case 'h': // horizontal lineto, relative
        x += current[1];
        g.lineTo(x + l, y + t);
        break;

      case 'H': // horizontal lineto, absolute
        x = current[1];
        g.lineTo(x + l, y + t);
        break;

      case 'v': // vertical lineto, relative
        y += current[1];
        g.lineTo(x + l, y + t);
        break;

      case 'V': // verical lineto, absolute
        y = current[1];
        g.lineTo(x + l, y + t);
        break;

      case 'm': // moveTo, relative
        x += current[1];
        y += current[2];
        g.moveTo(x + l, y + t);
        break;

      case 'M': // moveTo, absolute
        x = current[1];
        y = current[2];
        g.moveTo(x + l, y + t);
        break;

      case 'c': // bezierCurveTo, relative
        tempX = x + current[5];
        tempY = y + current[6];
        controlX = x + current[3];
        controlY = y + current[4];
        g.bezierCurveTo(
          x + current[1] + l, // x1
          y + current[2] + t, // y1
          controlX + l, // x2
          controlY + t, // y2
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        break;

      case 'C': // bezierCurveTo, absolute
        x = current[5];
        y = current[6];
        controlX = current[3];
        controlY = current[4];
        g.bezierCurveTo(
          current[1] + l,
          current[2] + t,
          controlX + l,
          controlY + t,
          x + l,
          y + t
        );
        break;

      case 's': // shorthand cubic bezierCurveTo, relative
        // transform to absolute x,y
        tempX = x + current[3];
        tempY = y + current[4];
        // calculate reflection of previous control points
        controlX = 2 * x - controlX;
        controlY = 2 * y - controlY;
        g.bezierCurveTo(
          controlX + l,
          controlY + t,
          x + current[1] + l,
          y + current[2] + t,
          tempX + l,
          tempY + t
        );

        // set control point to 2nd one of this command
        // the first control point is assumed to be the reflection of
        // the second control point on the previous command relative
        // to the current point.
        controlX = x + current[1];
        controlY = y + current[2];

        x = tempX;
        y = tempY;
        break;

      case 'S': // shorthand cubic bezierCurveTo, absolute
        tempX = current[3];
        tempY = current[4];
        // calculate reflection of previous control points
        controlX = 2*x - controlX;
        controlY = 2*y - controlY;
        g.bezierCurveTo(
          controlX + l,
          controlY + t,
          current[1] + l,
          current[2] + t,
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        // set control point to 2nd one of this command
        // the first control point is assumed to be the reflection of
        // the second control point on the previous command relative
        // to the current point.
        controlX = current[1];
        controlY = current[2];

        break;

      case 'q': // quadraticCurveTo, relative
        // transform to absolute x,y
        tempX = x + current[3];
        tempY = y + current[4];

        controlX = x + current[1];
        controlY = y + current[2];

        g.quadraticCurveTo(
          controlX + l,
          controlY + t,
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        break;

      case 'Q': // quadraticCurveTo, absolute
        tempX = current[3];
        tempY = current[4];

        g.quadraticCurveTo(
          current[1] + l,
          current[2] + t,
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        controlX = current[1];
        controlY = current[2];
        break;

      case 't': // shorthand quadraticCurveTo, relative

        // transform to absolute x,y
        tempX = x + current[1];
        tempY = y + current[2];

        if (previous[0].match(/[QqTt]/) === null) {
          // If there is no previous command or if the previous command was not a Q, q, T or t,
          // assume the control point is coincident with the current point
          controlX = x;
          controlY = y;
        }
        else if (previous[0] === 't') {
          // calculate reflection of previous control points for t
          controlX = 2 * x - tempControlX;
          controlY = 2 * y - tempControlY;
        }
        else if (previous[0] === 'q') {
          // calculate reflection of previous control points for q
          controlX = 2 * x - controlX;
          controlY = 2 * y - controlY;
        }

        tempControlX = controlX;
        tempControlY = controlY;

        g.quadraticCurveTo(
          controlX + l,
          controlY + t,
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        controlX = x + current[1];
        controlY = y + current[2];
        break;

      case 'T':
        tempX = current[1];
        tempY = current[2];

        // calculate reflection of previous control points
        controlX = 2 * x - controlX;
        controlY = 2 * y - controlY;
        g.quadraticCurveTo(
          controlX + l,
          controlY + t,
          tempX + l,
          tempY + t
        );
        x = tempX;
        y = tempY;
        break;

      case 'a':
        drawArc(g, x + l, y + t, [
          current[1],
          current[2],
          current[3],
          current[4],
          current[5],
          current[6] + x + l,
          current[7] + y + t
        ]);
        x += current[6];
        y += current[7];
        break;

      case 'A':
        drawArc(g, x + l, y + t, [
          current[1],
          current[2],
          current[3],
          current[4],
          current[5],
          current[6] + l,
          current[7] + t
        ]);
        x = current[6];
        y = current[7];
        break;

      case 'z':
      case 'Z':
        g.closePath();
        break;
    }
    previous = current;
  }
};

function drawArc(g, x, y, coords) {
  var seg = arc.segments(
    coords[5], // end x
    coords[6], // end y
    coords[0], // radius x
    coords[1], // radius y
    coords[3], // large flag
    coords[4], // sweep flag
    coords[2], // rotation
    x, y
  );
  for (var i=0; i<seg.length; ++i) {
    var bez = arc.bezier(seg[i]);
    g.bezierCurveTo.apply(g, bez);
  }
}


/***/ }),

/***/ "bZsP":
/***/ (function(module, exports, __webpack_require__) {

(function (global, factory) {
   true ? factory(exports, __webpack_require__("aZ75")) :
  typeof define === 'function' && define.amd ? define('d3-time-format', ['exports', 'd3-time'], factory) :
  factory((global.d3_time_format = {}),global.d3_time);
}(this, function (exports,d3Time) { 'use strict';

  function localDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(-1, d.m, d.d, d.H, d.M, d.S, d.L);
      date.setFullYear(d.y);
      return date;
    }
    return new Date(d.y, d.m, d.d, d.H, d.M, d.S, d.L);
  }

  function utcDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(Date.UTC(-1, d.m, d.d, d.H, d.M, d.S, d.L));
      date.setUTCFullYear(d.y);
      return date;
    }
    return new Date(Date.UTC(d.y, d.m, d.d, d.H, d.M, d.S, d.L));
  }

  function newYear(y) {
    return {y: y, m: 0, d: 1, H: 0, M: 0, S: 0, L: 0};
  }

  function locale$1(locale) {
    var locale_dateTime = locale.dateTime,
        locale_date = locale.date,
        locale_time = locale.time,
        locale_periods = locale.periods,
        locale_weekdays = locale.days,
        locale_shortWeekdays = locale.shortDays,
        locale_months = locale.months,
        locale_shortMonths = locale.shortMonths;

    var periodRe = formatRe(locale_periods),
        periodLookup = formatLookup(locale_periods),
        weekdayRe = formatRe(locale_weekdays),
        weekdayLookup = formatLookup(locale_weekdays),
        shortWeekdayRe = formatRe(locale_shortWeekdays),
        shortWeekdayLookup = formatLookup(locale_shortWeekdays),
        monthRe = formatRe(locale_months),
        monthLookup = formatLookup(locale_months),
        shortMonthRe = formatRe(locale_shortMonths),
        shortMonthLookup = formatLookup(locale_shortMonths);

    var formats = {
      "a": formatShortWeekday,
      "A": formatWeekday,
      "b": formatShortMonth,
      "B": formatMonth,
      "c": null,
      "d": formatDayOfMonth,
      "e": formatDayOfMonth,
      "H": formatHour24,
      "I": formatHour12,
      "j": formatDayOfYear,
      "L": formatMilliseconds,
      "m": formatMonthNumber,
      "M": formatMinutes,
      "p": formatPeriod,
      "S": formatSeconds,
      "U": formatWeekNumberSunday,
      "w": formatWeekdayNumber,
      "W": formatWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatYear,
      "Y": formatFullYear,
      "Z": formatZone,
      "%": formatLiteralPercent
    };

    var utcFormats = {
      "a": formatUTCShortWeekday,
      "A": formatUTCWeekday,
      "b": formatUTCShortMonth,
      "B": formatUTCMonth,
      "c": null,
      "d": formatUTCDayOfMonth,
      "e": formatUTCDayOfMonth,
      "H": formatUTCHour24,
      "I": formatUTCHour12,
      "j": formatUTCDayOfYear,
      "L": formatUTCMilliseconds,
      "m": formatUTCMonthNumber,
      "M": formatUTCMinutes,
      "p": formatUTCPeriod,
      "S": formatUTCSeconds,
      "U": formatUTCWeekNumberSunday,
      "w": formatUTCWeekdayNumber,
      "W": formatUTCWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatUTCYear,
      "Y": formatUTCFullYear,
      "Z": formatUTCZone,
      "%": formatLiteralPercent
    };

    var parses = {
      "a": parseShortWeekday,
      "A": parseWeekday,
      "b": parseShortMonth,
      "B": parseMonth,
      "c": parseLocaleDateTime,
      "d": parseDayOfMonth,
      "e": parseDayOfMonth,
      "H": parseHour24,
      "I": parseHour24,
      "j": parseDayOfYear,
      "L": parseMilliseconds,
      "m": parseMonthNumber,
      "M": parseMinutes,
      "p": parsePeriod,
      "S": parseSeconds,
      "U": parseWeekNumberSunday,
      "w": parseWeekdayNumber,
      "W": parseWeekNumberMonday,
      "x": parseLocaleDate,
      "X": parseLocaleTime,
      "y": parseYear,
      "Y": parseFullYear,
      "Z": parseZone,
      "%": parseLiteralPercent
    };

    // These recursive directive definitions must be deferred.
    formats.x = newFormat(locale_date, formats);
    formats.X = newFormat(locale_time, formats);
    formats.c = newFormat(locale_dateTime, formats);
    utcFormats.x = newFormat(locale_date, utcFormats);
    utcFormats.X = newFormat(locale_time, utcFormats);
    utcFormats.c = newFormat(locale_dateTime, utcFormats);

    function newFormat(specifier, formats) {
      return function(date) {
        var string = [],
            i = -1,
            j = 0,
            n = specifier.length,
            c,
            pad,
            format;

        if (!(date instanceof Date)) date = new Date(+date);

        while (++i < n) {
          if (specifier.charCodeAt(i) === 37) {
            string.push(specifier.slice(j, i));
            if ((pad = pads[c = specifier.charAt(++i)]) != null) c = specifier.charAt(++i);
            else pad = c === "e" ? " " : "0";
            if (format = formats[c]) c = format(date, pad);
            string.push(c);
            j = i + 1;
          }
        }

        string.push(specifier.slice(j, i));
        return string.join("");
      };
    }

    function newParse(specifier, newDate) {
      return function(string) {
        var d = newYear(1900),
            i = parseSpecifier(d, specifier, string += "", 0);
        if (i != string.length) return null;

        // The am-pm flag is 0 for AM, and 1 for PM.
        if ("p" in d) d.H = d.H % 12 + d.p * 12;

        // Convert day-of-week and week-of-year to day-of-year.
        if ("W" in d || "U" in d) {
          if (!("w" in d)) d.w = "W" in d ? 1 : 0;
          var day = "Z" in d ? utcDate(newYear(d.y)).getUTCDay() : newDate(newYear(d.y)).getDay();
          d.m = 0;
          d.d = "W" in d ? (d.w + 6) % 7 + d.W * 7 - (day + 5) % 7 : d.w + d.U * 7 - (day + 6) % 7;
        }

        // If a time zone is specified, all fields are interpreted as UTC and then
        // offset according to the specified time zone.
        if ("Z" in d) {
          d.H += d.Z / 100 | 0;
          d.M += d.Z % 100;
          return utcDate(d);
        }

        // Otherwise, all fields are in local time.
        return newDate(d);
      };
    }

    function parseSpecifier(d, specifier, string, j) {
      var i = 0,
          n = specifier.length,
          m = string.length,
          c,
          parse;

      while (i < n) {
        if (j >= m) return -1;
        c = specifier.charCodeAt(i++);
        if (c === 37) {
          c = specifier.charAt(i++);
          parse = parses[c in pads ? specifier.charAt(i++) : c];
          if (!parse || ((j = parse(d, string, j)) < 0)) return -1;
        } else if (c != string.charCodeAt(j++)) {
          return -1;
        }
      }

      return j;
    }

    function parsePeriod(d, string, i) {
      var n = periodRe.exec(string.slice(i));
      return n ? (d.p = periodLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseShortWeekday(d, string, i) {
      var n = shortWeekdayRe.exec(string.slice(i));
      return n ? (d.w = shortWeekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseWeekday(d, string, i) {
      var n = weekdayRe.exec(string.slice(i));
      return n ? (d.w = weekdayLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseShortMonth(d, string, i) {
      var n = shortMonthRe.exec(string.slice(i));
      return n ? (d.m = shortMonthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseMonth(d, string, i) {
      var n = monthRe.exec(string.slice(i));
      return n ? (d.m = monthLookup[n[0].toLowerCase()], i + n[0].length) : -1;
    }

    function parseLocaleDateTime(d, string, i) {
      return parseSpecifier(d, locale_dateTime, string, i);
    }

    function parseLocaleDate(d, string, i) {
      return parseSpecifier(d, locale_date, string, i);
    }

    function parseLocaleTime(d, string, i) {
      return parseSpecifier(d, locale_time, string, i);
    }

    function formatShortWeekday(d) {
      return locale_shortWeekdays[d.getDay()];
    }

    function formatWeekday(d) {
      return locale_weekdays[d.getDay()];
    }

    function formatShortMonth(d) {
      return locale_shortMonths[d.getMonth()];
    }

    function formatMonth(d) {
      return locale_months[d.getMonth()];
    }

    function formatPeriod(d) {
      return locale_periods[+(d.getHours() >= 12)];
    }

    function formatUTCShortWeekday(d) {
      return locale_shortWeekdays[d.getUTCDay()];
    }

    function formatUTCWeekday(d) {
      return locale_weekdays[d.getUTCDay()];
    }

    function formatUTCShortMonth(d) {
      return locale_shortMonths[d.getUTCMonth()];
    }

    function formatUTCMonth(d) {
      return locale_months[d.getUTCMonth()];
    }

    function formatUTCPeriod(d) {
      return locale_periods[+(d.getUTCHours() >= 12)];
    }

    return {
      format: function(specifier) {
        var f = newFormat(specifier += "", formats);
        f.parse = newParse(specifier, localDate);
        f.toString = function() { return specifier; };
        return f;
      },
      utcFormat: function(specifier) {
        var f = newFormat(specifier += "", utcFormats);
        f.parse = newParse(specifier, utcDate);
        f.toString = function() { return specifier; };
        return f;
      }
    };
  };

  var pads = {"-": "", "_": " ", "0": "0"};
  var numberRe = /^\s*\d+/;
  var percentRe = /^%/;
  var requoteRe = /[\\\^\$\*\+\?\|\[\]\(\)\.\{\}]/g;
  function pad(value, fill, width) {
    var sign = value < 0 ? "-" : "",
        string = (sign ? -value : value) + "",
        length = string.length;
    return sign + (length < width ? new Array(width - length + 1).join(fill) + string : string);
  }

  function requote(s) {
    return s.replace(requoteRe, "\\$&");
  }

  function formatRe(names) {
    return new RegExp("^(?:" + names.map(requote).join("|") + ")", "i");
  }

  function formatLookup(names) {
    var map = {}, i = -1, n = names.length;
    while (++i < n) map[names[i].toLowerCase()] = i;
    return map;
  }

  function parseWeekdayNumber(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.w = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberSunday(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.U = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberMonday(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.W = +n[0], i + n[0].length) : -1;
  }

  function parseFullYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 4));
    return n ? (d.y = +n[0], i + n[0].length) : -1;
  }

  function parseYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.y = +n[0] + (+n[0] > 68 ? 1900 : 2000), i + n[0].length) : -1;
  }

  function parseZone(d, string, i) {
    var n = /^(Z)|([+-]\d\d)(?:\:?(\d\d))?/.exec(string.slice(i, i + 6));
    return n ? (d.Z = n[1] ? 0 : -(n[2] + (n[3] || "00")), i + n[0].length) : -1;
  }

  function parseMonthNumber(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.m = n[0] - 1, i + n[0].length) : -1;
  }

  function parseDayOfMonth(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.d = +n[0], i + n[0].length) : -1;
  }

  function parseDayOfYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.m = 0, d.d = +n[0], i + n[0].length) : -1;
  }

  function parseHour24(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.H = +n[0], i + n[0].length) : -1;
  }

  function parseMinutes(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.M = +n[0], i + n[0].length) : -1;
  }

  function parseSeconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.S = +n[0], i + n[0].length) : -1;
  }

  function parseMilliseconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.L = +n[0], i + n[0].length) : -1;
  }

  function parseLiteralPercent(d, string, i) {
    var n = percentRe.exec(string.slice(i, i + 1));
    return n ? i + n[0].length : -1;
  }

  function formatDayOfMonth(d, p) {
    return pad(d.getDate(), p, 2);
  }

  function formatHour24(d, p) {
    return pad(d.getHours(), p, 2);
  }

  function formatHour12(d, p) {
    return pad(d.getHours() % 12 || 12, p, 2);
  }

  function formatDayOfYear(d, p) {
    return pad(1 + d3Time.day.count(d3Time.year(d), d), p, 3);
  }

  function formatMilliseconds(d, p) {
    return pad(d.getMilliseconds(), p, 3);
  }

  function formatMonthNumber(d, p) {
    return pad(d.getMonth() + 1, p, 2);
  }

  function formatMinutes(d, p) {
    return pad(d.getMinutes(), p, 2);
  }

  function formatSeconds(d, p) {
    return pad(d.getSeconds(), p, 2);
  }

  function formatWeekNumberSunday(d, p) {
    return pad(d3Time.sunday.count(d3Time.year(d), d), p, 2);
  }

  function formatWeekdayNumber(d) {
    return d.getDay();
  }

  function formatWeekNumberMonday(d, p) {
    return pad(d3Time.monday.count(d3Time.year(d), d), p, 2);
  }

  function formatYear(d, p) {
    return pad(d.getFullYear() % 100, p, 2);
  }

  function formatFullYear(d, p) {
    return pad(d.getFullYear() % 10000, p, 4);
  }

  function formatZone(d) {
    var z = d.getTimezoneOffset();
    return (z > 0 ? "-" : (z *= -1, "+"))
        + pad(z / 60 | 0, "0", 2)
        + pad(z % 60, "0", 2);
  }

  function formatUTCDayOfMonth(d, p) {
    return pad(d.getUTCDate(), p, 2);
  }

  function formatUTCHour24(d, p) {
    return pad(d.getUTCHours(), p, 2);
  }

  function formatUTCHour12(d, p) {
    return pad(d.getUTCHours() % 12 || 12, p, 2);
  }

  function formatUTCDayOfYear(d, p) {
    return pad(1 + d3Time.utcDay.count(d3Time.utcYear(d), d), p, 3);
  }

  function formatUTCMilliseconds(d, p) {
    return pad(d.getUTCMilliseconds(), p, 3);
  }

  function formatUTCMonthNumber(d, p) {
    return pad(d.getUTCMonth() + 1, p, 2);
  }

  function formatUTCMinutes(d, p) {
    return pad(d.getUTCMinutes(), p, 2);
  }

  function formatUTCSeconds(d, p) {
    return pad(d.getUTCSeconds(), p, 2);
  }

  function formatUTCWeekNumberSunday(d, p) {
    return pad(d3Time.utcSunday.count(d3Time.utcYear(d), d), p, 2);
  }

  function formatUTCWeekdayNumber(d) {
    return d.getUTCDay();
  }

  function formatUTCWeekNumberMonday(d, p) {
    return pad(d3Time.utcMonday.count(d3Time.utcYear(d), d), p, 2);
  }

  function formatUTCYear(d, p) {
    return pad(d.getUTCFullYear() % 100, p, 2);
  }

  function formatUTCFullYear(d, p) {
    return pad(d.getUTCFullYear() % 10000, p, 4);
  }

  function formatUTCZone() {
    return "+0000";
  }

  function formatLiteralPercent() {
    return "%";
  }

  var locale = locale$1({
    dateTime: "%a %b %e %X %Y",
    date: "%m/%d/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  });

  var caES = locale$1({
    dateTime: "%A, %e de %B de %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"],
    shortDays: ["dg.", "dl.", "dt.", "dc.", "dj.", "dv.", "ds."],
    months: ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
    shortMonths: ["gen.", "febr.", "març", "abr.", "maig", "juny", "jul.", "ag.", "set.", "oct.", "nov.", "des."]
  });

  var deCH = locale$1({
    dateTime: "%A, der %e. %B %Y, %X",
    date: "%d.%m.%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    shortMonths: ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
  });

  var deDE = locale$1({
    dateTime: "%A, der %e. %B %Y, %X",
    date: "%d.%m.%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
    months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    shortMonths: ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
  });

  var enCA = locale$1({
    dateTime: "%a %b %e %X %Y",
    date: "%Y-%m-%d",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  });

  var enGB = locale$1({
    dateTime: "%a %e %b %X %Y",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  });

  var esES = locale$1({
    dateTime: "%A, %e de %B de %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    shortDays: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
    months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    shortMonths: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  });

  var fiFI = locale$1({
    dateTime: "%A, %-d. %Bta %Y klo %X",
    date: "%-d.%-m.%Y",
    time: "%H:%M:%S",
    periods: ["a.m.", "p.m."],
    days: ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"],
    shortDays: ["Su", "Ma", "Ti", "Ke", "To", "Pe", "La"],
    months: ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"],
    shortMonths: ["Tammi", "Helmi", "Maalis", "Huhti", "Touko", "Kesä", "Heinä", "Elo", "Syys", "Loka", "Marras", "Joulu"]
  });

  var frCA = locale$1({
    dateTime: "%a %e %b %Y %X",
    date: "%Y-%m-%d",
    time: "%H:%M:%S",
    periods: ["", ""],
    days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    shortDays: ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"],
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    shortMonths: ["jan", "fév", "mar", "avr", "mai", "jui", "jul", "aoû", "sep", "oct", "nov", "déc"]
  });

  var frFR = locale$1({
    dateTime: "%A, le %e %B %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    shortDays: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    shortMonths: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
  });

  var heIL = locale$1({
    dateTime: "%A, %e ב%B %Y %X",
    date: "%d.%m.%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    shortDays: ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"],
    months: ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"],
    shortMonths: ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"]
  });

  var huHU = locale$1({
    dateTime: "%Y. %B %-e., %A %X",
    date: "%Y. %m. %d.",
    time: "%H:%M:%S",
    periods: ["de.", "du."], // unused
    days: ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"],
    shortDays: ["V", "H", "K", "Sze", "Cs", "P", "Szo"],
    months: ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"],
    shortMonths: ["jan.", "feb.", "már.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."]
  });

  var itIT = locale$1({
    dateTime: "%A %e %B %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
    shortDays: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
    months: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"],
    shortMonths: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
  });

  var jaJP = locale$1({
    dateTime: "%Y %b %e %a %X",
    date: "%Y/%m/%d",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    shortDays: ["日", "月", "火", "水", "木", "金", "土"],
    months: ["睦月", "如月", "弥生", "卯月", "皐月", "水無月", "文月", "葉月", "長月", "神無月", "霜月", "師走"],
    shortMonths: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
  });

  var koKR = locale$1({
    dateTime: "%Y/%m/%d %a %X",
    date: "%Y/%m/%d",
    time: "%H:%M:%S",
    periods: ["오전", "오후"],
    days: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
    shortDays: ["일", "월", "화", "수", "목", "금", "토"],
    months: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
    shortMonths: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
  });

  var mkMK = locale$1({
    dateTime: "%A, %e %B %Y г. %X",
    date: "%d.%m.%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["недела", "понеделник", "вторник", "среда", "четврток", "петок", "сабота"],
    shortDays: ["нед", "пон", "вто", "сре", "чет", "пет", "саб"],
    months: ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"],
    shortMonths: ["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"]
  });

  var nlNL = locale$1({
    dateTime: "%a %e %B %Y %T",
    date: "%d-%m-%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
    shortDays: ["zo", "ma", "di", "wo", "do", "vr", "za"],
    months: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    shortMonths: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
  });

  var plPL = locale$1({
    dateTime: "%A, %e %B %Y, %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"], // unused
    days: ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"],
    shortDays: ["Niedz.", "Pon.", "Wt.", "Śr.", "Czw.", "Pt.", "Sob."],
    months: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"],
    shortMonths: ["Stycz.", "Luty", "Marz.", "Kwie.", "Maj", "Czerw.", "Lipc.", "Sierp.", "Wrz.", "Paźdz.", "Listop.", "Grudz."]/* In Polish language abbraviated months are not commonly used so there is a dispute about the proper abbraviations. */
  });

  var ptBR = locale$1({
    dateTime: "%A, %e de %B de %Y. %X",
    date: "%d/%m/%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    shortDays: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    months: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"],
    shortMonths: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  });

  var ruRU = locale$1({
    dateTime: "%A, %e %B %Y г. %X",
    date: "%d.%m.%Y",
    time: "%H:%M:%S",
    periods: ["AM", "PM"],
    days: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
    shortDays: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
    shortMonths: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
  });

  var svSE = locale$1({
    dateTime: "%A den %d %B %Y %X",
    date: "%Y-%m-%d",
    time: "%H:%M:%S",
    periods: ["fm", "em"],
    days: ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"],
    shortDays: ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"],
    months: ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
  });

  var zhCN = locale$1({
    dateTime: "%a %b %e %X %Y",
    date: "%Y/%-m/%-d",
    time: "%H:%M:%S",
    periods: ["上午", "下午"],
    days: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    shortDays: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    months: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
    shortMonths: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]
  });

  var isoSpecifier = "%Y-%m-%dT%H:%M:%S.%LZ";

  function formatIsoNative(date) {
    return date.toISOString();
  }

  formatIsoNative.parse = function(string) {
    var date = new Date(string);
    return isNaN(date) ? null : date;
  };

  formatIsoNative.toString = function() {
    return isoSpecifier;
  };

  var formatIso = Date.prototype.toISOString && +new Date("2000-01-01T00:00:00.000Z")
      ? formatIsoNative
      : locale.utcFormat(isoSpecifier);

  var format = locale.format;
  var utcFormat = locale.utcFormat;

  var version = "0.2.1";

  exports.version = version;
  exports.format = format;
  exports.utcFormat = utcFormat;
  exports.locale = locale$1;
  exports.localeCaEs = caES;
  exports.localeDeCh = deCH;
  exports.localeDeDe = deDE;
  exports.localeEnCa = enCA;
  exports.localeEnGb = enGB;
  exports.localeEnUs = locale;
  exports.localeEsEs = esES;
  exports.localeFiFi = fiFI;
  exports.localeFrCa = frCA;
  exports.localeFrFr = frFR;
  exports.localeHeIl = heIL;
  exports.localeHuHu = huHU;
  exports.localeItIt = itIT;
  exports.localeJaJp = jaJP;
  exports.localeKoKr = koKR;
  exports.localeMkMk = mkMK;
  exports.localeNlNl = nlNL;
  exports.localePlPl = plPL;
  exports.localePtBr = ptBR;
  exports.localeRuRu = ruRU;
  exports.localeSvSe = svSE;
  exports.localeZhCn = zhCN;
  exports.isoFormat = formatIso;

}));

/***/ }),

/***/ "cihr":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (AxisOrient) {
    AxisOrient[AxisOrient["TOP"] = 'top'] = "TOP";
    AxisOrient[AxisOrient["RIGHT"] = 'right'] = "RIGHT";
    AxisOrient[AxisOrient["LEFT"] = 'left'] = "LEFT";
    AxisOrient[AxisOrient["BOTTOM"] = 'bottom'] = "BOTTOM";
})(exports.AxisOrient || (exports.AxisOrient = {}));
var AxisOrient = exports.AxisOrient;
exports.defaultAxisConfig = {
    offset: undefined,
    grid: undefined,
    labels: true,
    labelMaxLength: 25,
    tickSize: undefined,
    characterWidth: 6
};
exports.defaultFacetAxisConfig = {
    axisWidth: 0,
    labels: true,
    grid: false,
    tickSize: 0
};
//# sourceMappingURL=axis.js.map

/***/ }),

/***/ "ct8e":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Geo(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, Geo.Parameters);
  Transform.addParameters(this, {
    lon: {type: 'field'},
    lat: {type: 'field'}
  });

  this._output = {
    'x': 'layout_x',
    'y': 'layout_y'
  };
  return this.mutates(true);
}

Geo.Parameters = {
  projection: {type: 'value', default: 'mercator'},
  center:     {type: 'array<value>'},
  translate:  {type: 'array<value>', default: __webpack_require__("MRce").center},
  rotate:     {type: 'array<value>'},
  scale:      {type: 'value'},
  precision:  {type: 'value'},
  clipAngle:  {type: 'value'},
  clipExtent: {type: 'value'}
};

Geo.d3Projection = function() {
  var p = this.param('projection'),
      param = Geo.Parameters,
      proj, name, value;

  if (p !== this._mode) {
    this._mode = p;
    this._projection = d3.geo[p]();
  }
  proj = this._projection;

  for (name in param) {
    if (name === 'projection' || !proj[name]) continue;
    value = this.param(name);
    if (value === undefined || (dl.isArray(value) && value.length === 0)) {
      continue;
    }
    if (value !== proj[name]()) {
      proj[name](value);
    }
  }

  return proj;
};

var prototype = (Geo.prototype = Object.create(Transform.prototype));
prototype.constructor = Geo;

prototype.transform = function(input) {
  log.debug(input, ['geo']);

  var output = this._output,
      lon = this.param('lon').accessor,
      lat = this.param('lat').accessor,
      proj = Geo.d3Projection.call(this);

  function set(t) {
    var ll = [lon(t), lat(t)];
    var xy = proj(ll) || [null, null];
    Tuple.set(t, output.x, xy[0]);
    Tuple.set(t, output.y, xy[1]);
  }

  input.add.forEach(set);
  if (this.reevaluate(input)) {
    input.mod.forEach(set);
    input.rem.forEach(set);
  }

  input.fields[output.x] = 1;
  input.fields[output.y] = 1;
  return input;
};

module.exports = Geo;

Geo.baseSchema = {
  "projection": {
    "description": "The type of cartographic projection to use.",
    "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
    "default": "mercator"
  },
  "center": {
    "description": "The center of the projection.",
    "oneOf": [
      {
        "type": "array",
        "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
        "minItems": 2,
        "maxItems": 2
      },
      {"$ref": "#/refs/signal"}
    ]
  },
  "translate": {
    "description": "The translation of the projection.",
    "oneOf": [
      {
        "type": "array",
        "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]},
        "minItems": 2,
        "maxItems": 2
      },
      {"$ref": "#/refs/signal"}
    ]
  },
  "rotate": {
    "description": "The rotation of the projection.",
    "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
  },
  "scale": {
    "description": "The scale of the projection.",
    "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
  },
  "precision": {
    "description": "The desired precision of the projection.",
    "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
  },
  "clipAngle": {
    "description": "The clip angle of the projection.",
    "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
  },
  "clipExtent": {
    "description": "The clip extent of the projection.",
    "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]
  }
};

Geo.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Geo transform",
  "description": "Performs a cartographic projection. Given longitude and latitude values, sets corresponding x and y properties for a mark.",
  "type": "object",
  "properties": dl.extend({
    "type": {"enum": ["geo"]},
    "lon": {
      "description": "The input longitude values.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "lat": {
      "description": "The input latitude values.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "x": {"type": "string", "default": "layout_x"},
        "y": {"type": "string", "default": "layout_y"}
      },
      "additionalProperties": false
    }
  }, Geo.baseSchema),
  "required": ["type", "lon", "lat"],
  "additionalProperties": false
};



/***/ }),

/***/ "cwb4":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");

module.exports = function(data, format) {
  var d = util.isObject(data) && !util.isBuffer(data) ?
    data : JSON.parse(data);
  if (format && format.property) {
    d = util.accessor(format.property)(d);
  }
  return d;
};


/***/ }),

/***/ "eJnU":
/***/ (function(module, exports) {

// Path parsing and rendering code adapted from fabric.js -- Thanks!
var cmdlen = { m:2, l:2, h:1, v:1, c:6, s:4, q:4, t:2, a:7 },
    regexp = [/([MLHVCSQTAZmlhvcsqtaz])/g, /###/, /(\d)([-+])/g, /\s|,|###/];

module.exports = function(pathstr) {
  var result = [],
      path,
      curr,
      chunks,
      parsed, param,
      cmd, len, i, j, n, m;

  // First, break path into command sequence
  path = pathstr
    .slice()
    .replace(regexp[0], '###$1')
    .split(regexp[1])
    .slice(1);

  // Next, parse each command in turn
  for (i=0, n=path.length; i<n; ++i) {
    curr = path[i];
    chunks = curr
      .slice(1)
      .trim()
      .replace(regexp[2],'$1###$2')
      .split(regexp[3]);
    cmd = curr.charAt(0);

    parsed = [cmd];
    for (j=0, m=chunks.length; j<m; ++j) {
      if ((param = +chunks[j]) === param) { // not NaN
        parsed.push(param);
      }
    }

    len = cmdlen[cmd.toLowerCase()];
    if (parsed.length-1 > len) {
      for (j=1, m=parsed.length; j<m; j+=len) {
        result.push([cmd].concat(parsed.slice(j, j+len)));
      }
    }
    else {
      result.push(parsed);
    }
  }

  return result;
};


/***/ }),

/***/ "eVGq":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/"),
    parse = __webpack_require__("eJnU"),
    render = __webpack_require__("bSC/"),
    linePath = __webpack_require__("zhsD").path.line;
    
function path(g, items) {
  var o = items[0],
      p = o.pathCache || (o.pathCache = parse(linePath(items)));
  render(g, p);
}

function pick(g, scene, x, y, gx, gy) {
  var items = scene.items,
      b = scene.bounds;

  if (!items || !items.length || b && !b.contains(gx, gy)) {
    return null;
  }

  if (g.pixelratio != null && g.pixelratio !== 1) {
    x *= g.pixelratio;
    y *= g.pixelratio;
  }
  return hit(g, items, x, y) ? items[0] : null;
}

var hit = util.testPath(path, false);

module.exports = {
  draw: util.drawOne(path),
  pick: pick,
  nested: true
};


/***/ }),

/***/ "ec8D":
/***/ (function(module, exports, __webpack_require__) {

var Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Lookup(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    on:      {type: 'data'},
    onKey:   {type: 'field', default: null},
    as:      {type: 'array<value>'},
    keys:    {type: 'array<field>', default: ['data']},
    default: {type: 'value'}
  });

  return this.mutates(true);
}

var prototype = (Lookup.prototype = Object.create(Transform.prototype));
prototype.constructor = Lookup;

prototype.transform = function(input, reset) {
  log.debug(input, ['lookup']);

  var on = this.param('on'),
      onLast = on.source.last(),
      onData = on.source.values(),
      onKey = this.param('onKey'),
      onF = onKey.field,
      keys = this.param('keys'),
      get = keys.accessor,
      as = this.param('as'),
      defaultValue = this.param('default'),
      lut = this._lut,
      i, v;

  // build lookup table on init, withKey modified, or tuple add/rem
  if (lut == null || this._on !== onF || onF && onLast.fields[onF] ||
      onLast.add.length || onLast.rem.length)
  {
    if (onF) { // build hash from withKey field
      onKey = onKey.accessor;
      for (lut={}, i=0; i<onData.length; ++i) {
        lut[onKey(v = onData[i])] = v;
      }
    } else { // otherwise, use index-based lookup
      lut = onData;
    }
    this._lut = lut;
    this._on = onF;
    reset = true;
  }

  function set(t) {
    for (var i=0; i<get.length; ++i) {
      var v = lut[get[i](t)] || defaultValue;
      Tuple.set(t, as[i], v);
    }
  }

  input.add.forEach(set);
  var run = keys.field.some(function(f) { return input.fields[f]; });
  if (run || reset) {
    input.mod.forEach(set);
    input.rem.forEach(set);
  }

  as.forEach(function(k) { input.fields[k] = 1; });
  return input;
};

module.exports = Lookup;

Lookup.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Lookup transform",
  "description": "Extends a data set by looking up values in another data set.",
  "type": "object",
  "properties": {
    "type": {"enum": ["lookup"]},
    "on": {
      "type": "string",
      "description": "The name of the secondary data set on which to lookup values."
    },
    "onKey": {
      "description": "The key field to lookup, or null for index-based lookup.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "keys": {
      "description": "One or more fields in the primary data set to match against the secondary data set.",
      "type": "array",
      "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
    },
    "as": {
      "type": "array",
      "description": "The names of the fields in which to store looked-up values.",
      "items": {"type": "string"}
    },
    "default": {
      // "type": "any",
      "description": "The default value to use if a lookup match fails."
    }
  },
  "required": ["type", "on", "as", "keys"],
  "additionalProperties": false
};


/***/ }),

/***/ "ei6W":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Treeify(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    groupby: {type: 'array<field>'}
  });

  this._output = {
    'children': 'children',
    'parent':   'parent'
  };
  return this.router(true).produces(true);
}

var prototype = (Treeify.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Treeify;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['treeifying']);

  var fields = this.param('groupby').field,
      childField = this._output.children,
      parentField = this._output.parent,
      summary = [{name:'*', ops: ['values'], as: [childField]}],
      aggrs = fields.map(function(f) {
        return dl.groupby(f).summarize(summary);
      }),
      prev = this._internal || [], curr = [], i, n;

  function level(index, node, values) {
    var vals = aggrs[index].execute(values);

    node[childField] = vals;
    vals.forEach(function(n) {
      n[parentField] = node;
      curr.push(Tuple.ingest(n));
      if (index+1 < fields.length) level(index+1, n, n[childField]);
      else n[childField].forEach(function(c) { c[parentField] = n; });
    });
  }

  var root = Tuple.ingest({});
  root[parentField] = null;
  curr.push(root);
  level(0, root, data);

  // update changeset with internal nodes
  for (i=0, n=curr.length; i<n; ++i) {
    input.add.push(curr[i]);
  }
  for (i=0, n=prev.length; i<n; ++i) {
    input.rem.push(prev[i]);
  }
  this._internal = curr;

  return input;
};

module.exports = Treeify;

Treeify.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Treeify transform",
  "type": "object",
  "properties": {
    "type": {"enum": ["treeify"]},
    "groupby": {
      "description": "An ordered list of fields by which to group tuples into a tree.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "children": {"type": "string", "default": "children"},
        "parent": {"type": "string", "default": "parent"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type", "groupby"]
};


/***/ }),

/***/ "ekYZ":
/***/ (function(module, exports, __webpack_require__) {

var DEPS = __webpack_require__("D3vM").ALL;

function create(cs, reflow) {
  var out = {};
  copy(cs, out);

  out.add = [];
  out.mod = [];
  out.rem = [];

  out.reflow = reflow;

  return out;
}

function copy(a, b) {
  b.stamp = a ? a.stamp : 0;
  b.sort  = a ? a.sort  : null;
  b.facet = a ? a.facet : null;
  b.trans = a ? a.trans : null;
  b.dirty = a ? a.dirty : [];
  b.request = a ? a.request : null;
  for (var d, i=0, n=DEPS.length; i<n; ++i) {
    b[d=DEPS[i]] = a ? a[d] : {};
  }
}

module.exports = {
  create: create,
  copy: copy
};

/***/ }),

/***/ "evf9":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/");
var halfpi = Math.PI / 2;

function path(g, o) {
  var x = o.x || 0,
      y = o.y || 0,
      ir = o.innerRadius || 0,
      or = o.outerRadius || 0,
      sa = (o.startAngle || 0) - halfpi,
      ea = (o.endAngle || 0) - halfpi;
  g.beginPath();
  if (ir === 0) g.moveTo(x, y);
  else g.arc(x, y, ir, sa, ea, 0);
  g.arc(x, y, or, ea, sa, 1);
  g.closePath();
}

module.exports = {
  draw: util.drawAll(path),
  pick: util.pickPath(path)
};

/***/ }),

/***/ "f2i1":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var encoding_1 = __webpack_require__("QSMf");
var mark_1 = __webpack_require__("j8cM");
var util_1 = __webpack_require__("ZAUf");
(function (StackOffset) {
    StackOffset[StackOffset["ZERO"] = 'zero'] = "ZERO";
    StackOffset[StackOffset["CENTER"] = 'center'] = "CENTER";
    StackOffset[StackOffset["NORMALIZE"] = 'normalize'] = "NORMALIZE";
    StackOffset[StackOffset["NONE"] = 'none'] = "NONE";
})(exports.StackOffset || (exports.StackOffset = {}));
var StackOffset = exports.StackOffset;
function stack(mark, encoding, config) {
    var stacked = (config && config.mark) ? config.mark.stacked : undefined;
    if (util_1.contains([StackOffset.NONE, null, false], stacked)) {
        return null;
    }
    if (!util_1.contains([mark_1.BAR, mark_1.AREA], mark)) {
        return null;
    }
    if (!encoding_1.isAggregate(encoding)) {
        return null;
    }
    var stackByChannels = channel_1.STACK_GROUP_CHANNELS.reduce(function (sc, channel) {
        if (encoding_1.has(encoding, channel) && !encoding[channel].aggregate) {
            sc.push(channel);
        }
        return sc;
    }, []);
    if (stackByChannels.length === 0) {
        return null;
    }
    var hasXField = encoding_1.has(encoding, channel_1.X);
    var hasYField = encoding_1.has(encoding, channel_1.Y);
    var xIsAggregate = hasXField && !!encoding.x.aggregate;
    var yIsAggregate = hasYField && !!encoding.y.aggregate;
    if (xIsAggregate !== yIsAggregate) {
        return {
            groupbyChannel: xIsAggregate ? (hasYField ? channel_1.Y : null) : (hasXField ? channel_1.X : null),
            fieldChannel: xIsAggregate ? channel_1.X : channel_1.Y,
            stackByChannels: stackByChannels,
            offset: stacked || StackOffset.ZERO
        };
    }
    return null;
}
exports.stack = stack;
//# sourceMappingURL=stack.js.map

/***/ }),

/***/ "fRRI":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Deps = __webpack_require__("Hqva").Dependencies;

var arrayType = /array/i,
    dataType  = /data/i,
    fieldType = /field/i,
    exprType  = /expr/i,
    valType   = /value/i;

function Parameter(name, type, transform) {
  this._name = name;
  this._type = type;
  this._transform = transform;

  // If parameter is defined w/signals, it must be resolved
  // on every pulse.
  this._value = [];
  this._accessors = [];
  this._resolution = false;
  this._signals = [];
}

var prototype = Parameter.prototype;

function get() {
  var isArray = arrayType.test(this._type),
      isData  = dataType.test(this._type),
      isField = fieldType.test(this._type);

  var val = isArray ? this._value : this._value[0],
      acc = isArray ? this._accessors : this._accessors[0];

  if (!dl.isValid(acc) && valType.test(this._type)) {
    return val;
  } else {
    return isData ? { name: val, source: acc } :
    isField ? { field: val, accessor: acc } : val;
  }
}

prototype.get = function() {
  var graph = this._transform._graph,
      isData  = dataType.test(this._type),
      isField = fieldType.test(this._type),
      i, n, sig, idx, val;

  // If we don't require resolution, return the value immediately.
  if (!this._resolution) return get.call(this);

  if (isData) {
    this._accessors = this._value.map(function(v) { return graph.data(v); });
    return get.call(this); // TODO: support signal as dataTypes
  }

  for (i=0, n=this._signals.length; i<n; ++i) {
    sig = this._signals[i];
    idx = sig.index;
    val = sig.value(graph);

    if (isField) {
      this._accessors[idx] = this._value[idx] != val ?
        dl.accessor(val) : this._accessors[idx];
    }

    this._value[idx] = val;
  }

  return get.call(this);
};

prototype.set = function(value) {
  var p = this,
      graph = p._transform._graph,
      isExpr = exprType.test(this._type),
      isData  = dataType.test(this._type),
      isField = fieldType.test(this._type);

  p._signals = [];
  this._value = dl.array(value).map(function(v, i) {
    var e;
    if (dl.isString(v)) {
      if (isExpr) {
        e = graph.expr(v);
        p._transform.dependency(Deps.FIELDS,  e.fields);
        p._transform.dependency(Deps.SIGNALS, e.globals);
        p._transform.dependency(Deps.DATA,    e.dataSources);
        return e.fn;
      } else if (isField) {  // Backwards compatibility
        p._accessors[i] = dl.accessor(v);
        p._transform.dependency(Deps.FIELDS, dl.field(v));
      } else if (isData) {
        p._resolution = true;
        p._transform.dependency(Deps.DATA, v);
      }
      return v;
    } else if (v.value !== undefined) {
      return v.value;
    } else if (v.field !== undefined) {
      p._accessors[i] = dl.accessor(v.field);
      p._transform.dependency(Deps.FIELDS, dl.field(v.field));
      return v.field;
    } else if (v.signal !== undefined) {
      p._resolution = true;
      p._transform.dependency(Deps.SIGNALS, dl.field(v.signal)[0]);
      p._signals.push({
        index: i,
        value: function(graph) { return graph.signalRef(v.signal); }
      });
      return v.signal;
    } else if (v.expr !== undefined) {
      p._resolution = true;
      e = graph.expr(v.expr);
      p._transform.dependency(Deps.SIGNALS, e.globals);
      p._signals.push({
        index: i,
        value: function() { return e.fn(); }
      });
      return v.expr;
    }

    return v;
  });

  return p._transform;
};

module.exports = Parameter;

// Schema for field|value-type parameters.
Parameter.schema = {
  "type": "object",
  "oneOf": [{
    "properties": {"field": {"type": "string"}},
    "required": ["field"]
  }, {
    "properties": {"value": {"type": "string"}},
    "required": ["value"]
  }]
};


/***/ }),

/***/ "fxxq":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h");

function parseBg(bg) {
  // return null if input is null or undefined
  if (bg == null) return null;
  // run through d3 rgb to sanity check
  return d3.rgb(bg) + '';
}

module.exports = parseBg;

parseBg.schema = {"defs": {"background": {"type": "string"}}};


/***/ }),

/***/ "gWW/":
/***/ (function(module, exports) {

function drawPathOne(path, g, o, items) {
  if (path(g, items)) return;

  var opac = o.opacity == null ? 1 : o.opacity;
  if (opac===0) return;

  if (o.fill && fill(g, o, opac)) { g.fill(); }
  if (o.stroke && stroke(g, o, opac)) { g.stroke(); }
}

function drawPathAll(path, g, scene, bounds) {
  var i, len, item;
  for (i=0, len=scene.items.length; i<len; ++i) {
    item = scene.items[i];
    if (!bounds || bounds.intersects(item.bounds)) {
      drawPathOne(path, g, item, item);
    }
  }
}

function drawAll(pathFunc) {
  return function(g, scene, bounds) {
    drawPathAll(pathFunc, g, scene, bounds);
  };
}

function drawOne(pathFunc) {
  return function(g, scene, bounds) {
    if (!scene.items.length) return;
    if (!bounds || bounds.intersects(scene.bounds)) {
      drawPathOne(pathFunc, g, scene.items[0], scene.items);
    }
  };
}

var trueFunc = function() { return true; };

function pick(test) {
  if (!test) test = trueFunc;

  return function(g, scene, x, y, gx, gy) {
    if (!scene.items.length) return null;

    var o, b, i;

    if (g.pixelratio != null && g.pixelratio !== 1) {
      x *= g.pixelratio;
      y *= g.pixelratio;
    }

    for (i=scene.items.length; --i >= 0;) {
      o = scene.items[i]; b = o.bounds;
      // first hit test against bounding box
      if ((b && !b.contains(gx, gy)) || !b) continue;
      // if in bounding box, perform more careful test
      if (test(g, o, x, y, gx, gy)) return o;
    }
    return null;
  };
}

function testPath(path, filled) {
  return function(g, o, x, y) {
    var item = Array.isArray(o) ? o[0] : o,
        fill = (filled == null) ? item.fill : filled,
        stroke = item.stroke && g.isPointInStroke, lw, lc;

    if (stroke) {
      lw = item.strokeWidth;
      lc = item.strokeCap;
      g.lineWidth = lw != null ? lw : 1;
      g.lineCap   = lc != null ? lc : 'butt';
    }

    return path(g, o) ? false :
      (fill && g.isPointInPath(x, y)) ||
      (stroke && g.isPointInStroke(x, y));
  };
}

function pickPath(path) {
  return pick(testPath(path));
}

function fill(g, o, opacity) {
  opacity *= (o.fillOpacity==null ? 1 : o.fillOpacity);
  if (opacity > 0) {
    g.globalAlpha = opacity;
    g.fillStyle = color(g, o, o.fill);
    return true;
  } else {
    return false;
  }
}

function stroke(g, o, opacity) {
  var lw = (lw = o.strokeWidth) != null ? lw : 1, lc;
  if (lw <= 0) return false;

  opacity *= (o.strokeOpacity==null ? 1 : o.strokeOpacity);
  if (opacity > 0) {
    g.globalAlpha = opacity;
    g.strokeStyle = color(g, o, o.stroke);
    g.lineWidth = lw;
    g.lineCap = (lc = o.strokeCap) != null ? lc : 'butt';
    g.vgLineDash(o.strokeDash || null);
    g.vgLineDashOffset(o.strokeDashOffset || 0);
    return true;
  } else {
    return false;
  }
}

function color(g, o, value) {
  return (value.id) ?
    gradient(g, value, o.bounds) :
    value;
}

function gradient(g, p, b) {
  var w = b.width(),
      h = b.height(),
      x1 = b.x1 + p.x1 * w,
      y1 = b.y1 + p.y1 * h,
      x2 = b.x1 + p.x2 * w,
      y2 = b.y1 + p.y2 * h,
      grad = g.createLinearGradient(x1, y1, x2, y2),
      stop = p.stops,
      i, n;

  for (i=0, n=stop.length; i<n; ++i) {
    grad.addColorStop(stop[i].offset, stop[i].color);
  }
  return grad;
}

module.exports = {
  drawOne:  drawOne,
  drawAll:  drawAll,
  pick:     pick,
  pickPath: pickPath,
  testPath: testPath,
  stroke:   stroke,
  fill:     fill,
  color:    color,
  gradient: gradient
};


/***/ }),

/***/ "ggRp":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");

var TYPES = '__types__';

var PARSERS = {
  boolean: util.boolean,
  integer: util.number,
  number:  util.number,
  date:    util.date,
  string:  function(x) { return x == null || x === '' ? null : x + ''; }
};

var TESTS = {
  boolean: function(x) { return x==='true' || x==='false' || util.isBoolean(x); },
  integer: function(x) { return TESTS.number(x) && (x=+x) === ~~x; },
  number: function(x) { return !isNaN(+x) && !util.isDate(x); },
  date: function(x) { return !isNaN(Date.parse(x)); }
};

function annotation(data, types) {
  if (!types) return data && data[TYPES] || null;
  data[TYPES] = types;
}

function fieldNames(datum) {
  return util.keys(datum);
}

function bracket(fieldName) {
  return '[' + fieldName + ']';
}

function type(values, f) {
  values = util.array(values);
  f = util.$(f);
  var v, i, n;

  // if data array has type annotations, use them
  if (values[TYPES]) {
    v = f(values[TYPES]);
    if (util.isString(v)) return v;
  }

  for (i=0, n=values.length; !util.isValid(v) && i<n; ++i) {
    v = f ? f(values[i]) : values[i];
  }

  return util.isDate(v) ? 'date' :
    util.isNumber(v)    ? 'number' :
    util.isBoolean(v)   ? 'boolean' :
    util.isString(v)    ? 'string' : null;
}

function typeAll(data, fields) {
  if (!data.length) return;
  var get = fields ? util.identity : (fields = fieldNames(data[0]), bracket);
  return fields.reduce(function(types, f) {
    return (types[f] = type(data, get(f)), types);
  }, {});
}

function infer(values, f, ignore) {
  values = util.array(values);
  f = util.$(f);
  var i, j, v;

  // types to test for, in precedence order
  var types = ['boolean', 'integer', 'number', 'date'];

  for (i=0; i<values.length; ++i) {
    // get next value to test
    v = f ? f(values[i]) : values[i];
    // test value against remaining types
    for (j=0; j<types.length; ++j) {
      if ((!ignore || !ignore.test(v)) && util.isValid(v) && !TESTS[types[j]](v)) {
        types.splice(j, 1);
        j -= 1;
      }
    }
    // if no types left, return 'string'
    if (types.length === 0) return 'string';
  }

  return types[0];
}

function inferAll(data, fields, ignore) {
  var get = fields ? util.identity : (fields = fieldNames(data[0]), bracket);
  return fields.reduce(function(types, f) {
    types[f] = infer(data, get(f), ignore);
    return types;
  }, {});
}

type.annotation = annotation;
type.all = typeAll;
type.infer = infer;
type.inferAll = inferAll;
type.parsers = PARSERS;
module.exports = type;


/***/ }),

/***/ "gjoU":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");
var load = __webpack_require__("5AQc");
var read = __webpack_require__("YGNx");

module.exports = util
  .keys(read.formats)
  .reduce(function(out, type) {
    out[type] = function(opt, format, callback) {
      // process arguments
      if (util.isString(opt)) { opt = {url: opt}; }
      if (arguments.length === 2 && util.isFunction(format)) {
        callback = format;
        format = undefined;
      }

      // set up read format
      format = util.extend({parse: 'auto'}, format);
      format.type = type;

      // load data
      var data = load(opt, callback ? function(error, data) {
        if (error) { callback(error, null); return; }
        try {
          // data loaded, now parse it (async)
          data = read(data, format);
          callback(null, data);
        } catch (e) {
          callback(e, null);
        }
      } : undefined);

      // data loaded, now parse it (sync)
      if (!callback) return read(data, format);
    };
    return out;
  }, {});


/***/ }),

/***/ "gtuQ":
/***/ (function(module, exports) {

var tupleID = 0;

function ingest(datum) {
  datum = (datum === Object(datum)) ? datum : {data: datum};
  datum._id = ++tupleID;
  if (datum._prev) datum._prev = null;
  return datum;
}

function idMap(a, ids) {
  ids = ids || {};
  for (var i=0, n=a.length; i<n; ++i) {
    ids[a[i]._id] = 1;
  }
  return ids;
}

function copy(t, c) {
  c = c || {};
  for (var k in t) {
    if (k !== '_prev' && k !== '_id') c[k] = t[k];
  }
  return c;
}

module.exports = {
  ingest: ingest,
  idMap: idMap,

  derive: function(d) {
    return ingest(copy(d));
  },

  rederive: function(d, t) {
    return copy(d, t);
  },

  set: function(t, k, v) {
    return t[k] === v ? 0 : (t[k] = v, 1);
  },

  prev: function(t) {
    return t._prev || t;
  },

  prev_init: function(t) {
    if (!t._prev) { t._prev = {_id: t._id}; }
  },

  prev_update: function(t) {
    var p = t._prev, k, v;
    if (p) for (k in t) {
      if (k !== '_prev' && k !== '_id') {
        p[k] = ((v=t[k]) instanceof Object && v._prev) ? v._prev : v;
      }
    }
  },

  reset: function() { tupleID = 0; },

  idFilter: function(data) {
    var ids = {};
    for (var i=arguments.length; --i>0;) {
      idMap(arguments[i], ids);
    }
    return data.filter(function(x) { return !ids[x._id]; });
  }
};


/***/ }),

/***/ "h/tW":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (AggregateOp) {
    AggregateOp[AggregateOp["VALUES"] = 'values'] = "VALUES";
    AggregateOp[AggregateOp["COUNT"] = 'count'] = "COUNT";
    AggregateOp[AggregateOp["VALID"] = 'valid'] = "VALID";
    AggregateOp[AggregateOp["MISSING"] = 'missing'] = "MISSING";
    AggregateOp[AggregateOp["DISTINCT"] = 'distinct'] = "DISTINCT";
    AggregateOp[AggregateOp["SUM"] = 'sum'] = "SUM";
    AggregateOp[AggregateOp["MEAN"] = 'mean'] = "MEAN";
    AggregateOp[AggregateOp["AVERAGE"] = 'average'] = "AVERAGE";
    AggregateOp[AggregateOp["VARIANCE"] = 'variance'] = "VARIANCE";
    AggregateOp[AggregateOp["VARIANCEP"] = 'variancep'] = "VARIANCEP";
    AggregateOp[AggregateOp["STDEV"] = 'stdev'] = "STDEV";
    AggregateOp[AggregateOp["STDEVP"] = 'stdevp'] = "STDEVP";
    AggregateOp[AggregateOp["MEDIAN"] = 'median'] = "MEDIAN";
    AggregateOp[AggregateOp["Q1"] = 'q1'] = "Q1";
    AggregateOp[AggregateOp["Q3"] = 'q3'] = "Q3";
    AggregateOp[AggregateOp["MODESKEW"] = 'modeskew'] = "MODESKEW";
    AggregateOp[AggregateOp["MIN"] = 'min'] = "MIN";
    AggregateOp[AggregateOp["MAX"] = 'max'] = "MAX";
    AggregateOp[AggregateOp["ARGMIN"] = 'argmin'] = "ARGMIN";
    AggregateOp[AggregateOp["ARGMAX"] = 'argmax'] = "ARGMAX";
})(exports.AggregateOp || (exports.AggregateOp = {}));
var AggregateOp = exports.AggregateOp;
exports.AGGREGATE_OPS = [
    AggregateOp.VALUES,
    AggregateOp.COUNT,
    AggregateOp.VALID,
    AggregateOp.MISSING,
    AggregateOp.DISTINCT,
    AggregateOp.SUM,
    AggregateOp.MEAN,
    AggregateOp.AVERAGE,
    AggregateOp.VARIANCE,
    AggregateOp.VARIANCEP,
    AggregateOp.STDEV,
    AggregateOp.STDEVP,
    AggregateOp.MEDIAN,
    AggregateOp.Q1,
    AggregateOp.Q3,
    AggregateOp.MODESKEW,
    AggregateOp.MIN,
    AggregateOp.MAX,
    AggregateOp.ARGMIN,
    AggregateOp.ARGMAX,
];
exports.SUM_OPS = [
    AggregateOp.COUNT,
    AggregateOp.SUM,
    AggregateOp.DISTINCT
];
exports.SHARED_DOMAIN_OPS = [
    AggregateOp.MEAN,
    AggregateOp.AVERAGE,
    AggregateOp.STDEV,
    AggregateOp.STDEVP,
    AggregateOp.MEDIAN,
    AggregateOp.Q1,
    AggregateOp.Q3,
    AggregateOp.MIN,
    AggregateOp.MAX,
];
//# sourceMappingURL=aggregate.js.map

/***/ }),

/***/ "h36N":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    Tuple = __webpack_require__("Hqva").Tuple;

var DEPS = ["signals", "scales", "data", "fields"];

function properties(model, mark, spec) {
  var config = model.config(),
      code = "",
      names = dl.keys(spec),
      exprs = [], // parsed expressions injected in the generated code
      i, len, name, ref, vars = {},
      deps = {
        signals: {},
        scales:  {},
        data:    {},
        fields:  {},
        nested:  [],
        _nRefs:  {},  // Temp stash to de-dupe nested refs.
        reflow:  false
      };

  code += "var o = trans ? {} : item, d=0, exprs=this.exprs, set=this.tpl.set, tmpl=signals||{}, t;\n" +
          // Stash for dl.template
          "tmpl.datum  = item.datum;\n" +
          "tmpl.group  = group;\n" +
          "tmpl.parent = group.datum;\n";

  function handleDep(p) {
    if (ref[p] == null) return;
    var k = dl.array(ref[p]), i, n;
    for (i=0, n=k.length; i<n; ++i) {
      deps[p][k[i]] = 1;
    }
  }

  function handleNestedRefs(r) {
    var k = (r.parent ? "parent_" : "group_")+r.level;
    deps._nRefs[k] = r;
  }

  parseShape(model, config, spec);

  for (i=0, len=names.length; i<len; ++i) {
    ref = spec[name = names[i]];
    code += (i > 0) ? "\n  " : "  ";
    if (ref.rule) {
      // a production rule valueref
      ref = rule(model, name, ref.rule, exprs);
      code += "\n  " + ref.code;
    } else if (dl.isArray(ref)) {
      // a production rule valueref as an array
      ref = rule(model, name, ref, exprs);
      code += "\n  " + ref.code;
    } else {
      // a simple valueref
      ref = valueRef(config, name, ref);
      code += "d += set(o, "+dl.str(name)+", "+ref.val+");";
    }

    vars[name] = true;
    DEPS.forEach(handleDep);
    deps.reflow = deps.reflow || ref.reflow;
    if (ref.nested.length) ref.nested.forEach(handleNestedRefs);
  }

  // If nested references are present, sort them based on their level
  // to speed up determination of whether encoders should be reeval'd.
  dl.keys(deps._nRefs).forEach(function(k) { deps.nested.push(deps._nRefs[k]); });
  deps.nested.sort(function(a, b) {
    a = a.level;
    b = b.level;
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  });

  if (vars.x2) {
    if (vars.x) {
      code += "\n  if (o.x > o.x2) { " +
              "\n    t = o.x;" +
              "\n    d += set(o, 'x', o.x2);" +
              "\n    d += set(o, 'x2', t); " +
              "\n  };";
      code += "\n  d += set(o, 'width', (o.x2 - o.x));";
    } else if (vars.width) {
      code += "\n  d += set(o, 'x', (o.x2 - o.width));";
    } else {
      code += "\n  d += set(o, 'x', o.x2);";
    }
  }

  if (vars.xc) {
    if (vars.width) {
      code += "\n  d += set(o, 'x', (o.xc - o.width/2));" ;
    } else {
      code += "\n  d += set(o, 'x', o.xc);" ;
    }
  }

  if (vars.y2) {
    if (vars.y) {
      code += "\n  if (o.y > o.y2) { " +
              "\n    t = o.y;" +
              "\n    d += set(o, 'y', o.y2);" +
              "\n    d += set(o, 'y2', t);" +
              "\n  };";
      code += "\n  d += set(o, 'height', (o.y2 - o.y));";
    } else if (vars.height) {
      code += "\n  d += set(o, 'y', (o.y2 - o.height));";
    } else {
      code += "\n  d += set(o, 'y', o.y2);";
    }
  }

  if (vars.yc) {
    if (vars.height) {
      code += "\n  d += set(o, 'y', (o.yc - o.height/2));" ;
    } else {
      code += "\n  d += set(o, 'y', o.yc);" ;
    }
  }

  if (hasPath(mark, vars)) code += "\n  d += (item.touch(), 1);";
  code += "\n  if (trans) trans.interpolate(item, o);";
  code += "\n  return d > 0;";

  try {
    /* jshint evil:true */
    var encoder = Function('item', 'group', 'trans', 'db',
      'signals', 'predicates', code);

    encoder.tpl  = Tuple;
    encoder.exprs = exprs;
    encoder.util = dl;
    encoder.d3   = d3; // For color spaces
    dl.extend(encoder, dl.template.context);
    return {
      encode:  encoder,
      signals: dl.keys(deps.signals),
      scales:  dl.keys(deps.scales),
      data:    dl.keys(deps.data),
      fields:  dl.keys(deps.fields),
      nested:  deps.nested,
      reflow:  deps.reflow
    };
  } catch (e) {
    log.error(e);
    log.log(code);
  }
}

function dependencies(a, b) {
  if (!dl.isObject(a)) {
    a = {reflow: false, nested: []};
    DEPS.forEach(function(d) { a[d] = []; });
  }

  if (dl.isObject(b)) {
    a.reflow = a.reflow || b.reflow;
    a.nested.push.apply(a.nested, b.nested);
    DEPS.forEach(function(d) { a[d].push.apply(a[d], b[d]); });
  }

  return a;
}

function hasPath(mark, vars) {
  return vars.path ||
    ((mark==='area' || mark==='line') &&
      (vars.x || vars.x2 || vars.width ||
       vars.y || vars.y2 || vars.height ||
       vars.tension || vars.interpolate));
}

var hb = /{{(.*?)}}/g;
function parseShape(model, config, spec) {
  var shape = spec.shape,
      last = 0,
      value, match;

  if (shape && (value = shape.value)) {
    if (config.shape && config.shape[value]) {
      value = config.shape[value];
    }

    // Parse handlebars
    shape = '';
    while ((match = hb.exec(value)) !== null) {
      shape += value.substring(last, match.index);
      shape += model.expr(match[1]).fn();
      last = hb.lastIndex;
    }
    spec.shape.value = shape + value.substring(last);
  }
}

function rule(model, name, rules, exprs) {
  var config  = model.config(),
      deps = dependencies(),
      inputs  = [],
      code = '';

  (rules||[]).forEach(function(r, i) {
    var ref = valueRef(config, name, r);
    dependencies(deps, ref);

    if (r.test) {
      // rule uses an expression instead of a predicate.
      var exprFn = model.expr(r.test);
      deps.signals.push.apply(deps.signals, exprFn.globals);
      deps.data.push.apply(deps.data, exprFn.dataSources);

      code += "if (exprs[" + exprs.length + "](item.datum, item.mark.group.datum, null)) {" +
          "\n    d += set(o, "+dl.str(name)+", " +ref.val+");";
      code += rules[i+1] ? "\n  } else " : "  }";

      exprs.push(exprFn.fn);
    } else {
      var def = r.predicate,
          predName = def && (def.name || def),
          pred = model.predicate(predName),
          p = 'predicates['+dl.str(predName)+']',
          input = [], args = name+'_arg'+i;

      if (dl.isObject(def)) {
        dl.keys(def).forEach(function(k) {
          if (k === 'name') return;
          var ref = valueRef(config, i, def[k], true);
          input.push(dl.str(k)+': '+ref.val);
          dependencies(deps, ref);
        });
      }

      if (predName) {
        // append the predicates dependencies to our dependencies
        deps.signals.push.apply(deps.signals, pred.signals);
        deps.data.push.apply(deps.data, pred.data);
        inputs.push(args+" = {\n    "+input.join(",\n    ")+"\n  }");
        code += "if ("+p+".call("+p+","+args+", db, signals, predicates)) {" +
          "\n    d += set(o, "+dl.str(name)+", "+ref.val+");";
        code += rules[i+1] ? "\n  } else " : "  }";
      } else {
        code += "{" +
          "\n    d += set(o, "+dl.str(name)+", "+ref.val+");"+
          "\n  }\n";
      }
    }
  });

  if (inputs.length) code = "var " + inputs.join(",\n      ") + ";\n  " + code;
  return (deps.code = code, deps);
}

function valueRef(config, name, ref, predicateArg) {
  if (ref == null) return null;

  if (name==='fill' || name==='stroke') {
    if (ref.c) {
      return colorRef(config, 'hcl', ref.h, ref.c, ref.l);
    } else if (ref.h || ref.s) {
      return colorRef(config, 'hsl', ref.h, ref.s, ref.l);
    } else if (ref.l || ref.a) {
      return colorRef(config, 'lab', ref.l, ref.a, ref.b);
    } else if (ref.r || ref.g || ref.b) {
      return colorRef(config, 'rgb', ref.r, ref.g, ref.b);
    }
  }

  // initialize value
  var val = null, scale = null,
      deps = dependencies(),
      sgRef = null, fRef = null, sRef = null, tmpl = {};

  if (ref.template !== undefined) {
    val = dl.template.source(ref.template, 'tmpl', tmpl);
    dl.keys(tmpl).forEach(function(k) {
      var f = dl.field(k),
          a = f.shift();
      if (a === 'parent' || a === 'group') {
        deps.nested.push({
          parent: a === 'parent',
          group:  a === 'group',
          level:  1
        });
      } else if (a === 'datum') {
        deps.fields.push(f[0]);
      } else {
        deps.signals.push(a);
      }
    });
  }

  if (ref.value !== undefined) {
    val = dl.str(ref.value);
  }

  if (ref.signal !== undefined) {
    sgRef = dl.field(ref.signal);
    val = 'signals['+sgRef.map(dl.str).join('][')+']';
    deps.signals.push(sgRef.shift());
  }

  if (ref.field !== undefined) {
    ref.field = dl.isString(ref.field) ? {datum: ref.field} : ref.field;
    fRef = fieldRef(ref.field);
    val  = fRef.val;
    dependencies(deps, fRef);
  }

  if (ref.scale !== undefined) {
    sRef  = scaleRef(ref.scale);
    scale = sRef.val;
    dependencies(deps, sRef);
    deps.scales.push(ref.scale.name || ref.scale);

    // run through scale function if val specified.
    // if no val, scale function is predicate arg.
    if (val !== null || ref.band || ref.mult || ref.offset || !predicateArg) {
      val = scale + (ref.band ? '.rangeBand()' :
        '('+(val !== null ? val : 'item.datum.data')+')');
    } else if (predicateArg) {
      val = scale;
    }
  }

  // multiply, offset, return value
  val = '(' + (ref.mult?(dl.number(ref.mult)+' * '):'') + val + ')' +
        (ref.offset ? ' + ' + dl.number(ref.offset) : '');

  // Collate dependencies
  return (deps.val = val, deps);
}

function colorRef(config, type, x, y, z) {
  var xx = x ? valueRef(config, '', x) : config.color[type][0],
      yy = y ? valueRef(config, '', y) : config.color[type][1],
      zz = z ? valueRef(config, '', z) : config.color[type][2],
      deps = dependencies();

  [xx, yy, zz].forEach(function(v) {
    if (dl.isArray) return;
    dependencies(deps, v);
  });

  var val = '(this.d3.' + type + '(' + [xx.val, yy.val, zz.val].join(',') + ') + "")';
  return (deps.val = val, deps);
}

// {field: {datum: "foo"} }  -> item.datum.foo
// {field: {group: "foo"} }  -> group.foo
// {field: {parent: "foo"} } -> group.datum.foo
function fieldRef(ref) {
  if (dl.isString(ref)) {
    return {val: dl.field(ref).map(dl.str).join('][')};
  }

  // Resolve nesting/parent lookups
  var l = ref.level || 1,
      nested = (ref.group || ref.parent) && l,
      scope = nested ? Array(l).join('group.mark.') : '',
      r = fieldRef(ref.datum || ref.group || ref.parent || ref.signal),
      val = r.val,
      deps = dependencies(null, r);

  if (ref.datum) {
    val = 'item.datum['+val+']';
    deps.fields.push(ref.datum);
  } else if (ref.group) {
    val = scope+'group['+val+']';
    deps.nested.push({ level: l, group: true });
  } else if (ref.parent) {
    val = scope+'group.datum['+val+']';
    deps.nested.push({ level: l, parent: true });
  } else if (ref.signal) {
    val = 'signals['+val+']';
    deps.signals.push(dl.field(ref.signal)[0]);
    deps.reflow = true;
  }

  return (deps.val = val, deps);
}

// {scale: "x"}
// {scale: {name: "x"}},
// {scale: fieldRef}
function scaleRef(ref) {
  var scale = null,
      fr = null,
      deps = dependencies();

  if (dl.isString(ref)) {
    scale = dl.str(ref);
  } else if (ref.name) {
    scale = dl.isString(ref.name) ? dl.str(ref.name) : (fr = fieldRef(ref.name)).val;
  } else {
    scale = (fr = fieldRef(ref)).val;
  }

  scale = '(item.mark._scaleRefs['+scale+'] = 1, group.scale('+scale+'))';
  if (ref.invert) scale += '.invert';

  // Mark scale refs as they're dealt with separately in mark._scaleRefs.
  if (fr) fr.nested.forEach(function(g) { g.scale = true; });
  return fr ? (fr.val = scale, fr) : (deps.val = scale, deps);
}

module.exports = properties;

function valueSchema(type) {
  type = dl.isArray(type) ? {"enum": type} : {"type": type};
  var modType = type.type === "number" && type.type || "string";
  var valRef  = {
    "type": "object",
    "allOf": [{"$ref": "#/refs/" + modType + "Modifiers"}, {
      "oneOf": [{
        "$ref": "#/refs/signal",
        "required": ["signal"]
      }, {
        "properties": {"value": type},
        "required": ["value"]
      }, {
        "properties": {"field": {"$ref": "#/refs/field"}},
        "required": ["field"]
      }, {
        "properties": {"band": {"type": "boolean"}},
        "required": ["band"]
      }]
    }]
  };

  if (type.type === "string") {
    valRef.allOf[1].oneOf.push({
      "properties": {"template": {"type": "string"}},
      "required": ["template"]
    });
  }

  return {
    "oneOf": [{
      "type": "object",
      "properties": {
        "rule": {
          "type": "array",
          "items": {
            "allOf": [{"$ref": "#/defs/rule"}, valRef]
          }
        }
      },
      "additionalProperties": false,
      "required": ["rule"]
    },
    {
      "type": "array",
      "items": {
        "allOf": [{"$ref": "#/defs/rule"}, valRef]
      }
    },
    valRef]
  };
}

properties.schema = {
  "refs": {
    "field": {
      "title": "FieldRef",
      "oneOf": [
        {"type": "string"},
        {
          "oneOf": [
            {"$ref": "#/refs/signal"},
            {
              "type": "object",
              "properties": {"datum": {"$ref": "#/refs/field"}},
              "required": ["datum"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "group": {"$ref": "#/refs/field"},
                "level": {"type": "number"}
              },
              "required": ["group"],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "parent": {"$ref": "#/refs/field"},
                "level": {"type": "number"}
              },
              "required": ["parent"],
              "additionalProperties": false
            }
          ]
        }
      ]
    },

    "scale": {
      "title": "ScaleRef",
      "oneOf": [
        {"$ref": "#/refs/field"},
        {
          "type": "object",
          "properties": {
            "name": {"$ref": "#/refs/field"},
            "invert": {"type": "boolean", "default": false}
          },
          "required": ["name"]
        }
      ]
    },

    "stringModifiers": {
      "properties": {
        "scale": {"$ref": "#/refs/scale"}
      }
    },

    "numberModifiers": {
      "properties": {
        "mult": {"type": "number"},
        "offset": {"type": "number"},
        "scale": {"$ref": "#/refs/scale"}
      }
    },

    "value": valueSchema({}, "value"),
    "numberValue": valueSchema("number", "numberValue"),
    "stringValue": valueSchema("string", "stringValue"),
    "booleanValue": valueSchema("boolean", "booleanValue"),
    "arrayValue": valueSchema("array", "arrayValue"),

    "colorValue": {
      "title": "ColorRef",
      "oneOf": [{"$ref": "#/refs/stringValue"}, {
        "type": "object",
        "properties": {
          "r": {"$ref": "#/refs/numberValue"},
          "g": {"$ref": "#/refs/numberValue"},
          "b": {"$ref": "#/refs/numberValue"}
        },
        "required": ["r", "g", "b"]
      }, {
        "type": "object",
        "properties": {
          "h": {"$ref": "#/refs/numberValue"},
          "s": {"$ref": "#/refs/numberValue"},
          "l": {"$ref": "#/refs/numberValue"}
        },
        "required": ["h", "s", "l"]
      }, {
        "type": "object",
        "properties": {
          "l": {"$ref": "#/refs/numberValue"},
          "a": {"$ref": "#/refs/numberValue"},
          "b": {"$ref": "#/refs/numberValue"}
        },
        "required": ["l", "a", "b"]
      }, {
        "type": "object",
        "properties": {
          "h": {"$ref": "#/refs/numberValue"},
          "c": {"$ref": "#/refs/numberValue"},
          "l": {"$ref": "#/refs/numberValue"}
        },
        "required": ["h", "c", "l"]
      }]
    }
  },

  "defs": {
    "rule": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "predicate": {
              "oneOf": [
                {"type": "string"},
                {
                  "type": "object",
                  "properties": {"name": { "type": "string" }},
                  "required": ["name"]
                }
              ]
            }
          }
        },
        {
          "type": "object",
          "properties": {"test": {"type": "string"}}
        }
      ]
    },
    "propset": {
      "title": "Mark property set",
      "type": "object",
      "properties": {
        // Common Properties
        "x": {"$ref": "#/refs/numberValue"},
        "x2": {"$ref": "#/refs/numberValue"},
        "xc": {"$ref": "#/refs/numberValue"},
        "width": {"$ref": "#/refs/numberValue"},
        "y": {"$ref": "#/refs/numberValue"},
        "y2": {"$ref": "#/refs/numberValue"},
        "yc": {"$ref": "#/refs/numberValue"},
        "height": {"$ref": "#/refs/numberValue"},
        "opacity": {"$ref": "#/refs/numberValue"},
        "fill": {"$ref": "#/refs/colorValue"},
        "fillOpacity": {"$ref": "#/refs/numberValue"},
        "stroke": {"$ref": "#/refs/colorValue"},
        "strokeWidth": {"$ref": "#/refs/numberValue"},
        "strokeOpacity": {"$ref": "#/refs/numberValue"},
        "strokeDash": {"$ref": "#/refs/arrayValue"},
        "strokeDashOffset": {"$ref": "#/refs/numberValue"},
        "cursor": {"$ref": "#/refs/stringValue"},

        // Group-mark properties
        "clip": {"$ref": "#/refs/booleanValue"},

        // Symbol-mark properties
        "size": {"$ref": "#/refs/numberValue"},
        "shape": {
          "anyOf": [
            valueSchema(["circle", "square", "cross", "diamond",
              "triangle-up", "triangle-down"]),
            {"$ref": "#/refs/stringValue"}
          ]
        },

        // Path-mark properties
        "path": {"$ref": "#/refs/stringValue"},

        // Arc-mark properties
        "innerRadius": {"$ref": "#/refs/numberValue"},
        "outerRadius": {"$ref": "#/refs/numberValue"},
        "startAngle": {"$ref": "#/refs/numberValue"},
        "endAngle": {"$ref": "#/refs/numberValue"},

        // Area- and line-mark properties
        "interpolate": valueSchema(["linear", "linear-closed",
          "step", "step-before", "step-after",
          "basis", "basis-open", "basis-closed", 
          "cardinal", "cardinal-open", "cardinal-closed",
          "bundle", "monotone"]),
        "tension": {"$ref": "#/refs/numberValue"},
        "orient": valueSchema(["horizontal", "vertical"]),

        // Image-mark properties
        "url": {"$ref": "#/refs/stringValue"},
        "align": valueSchema(["left", "right", "center"]),
        "baseline": valueSchema(["top", "middle", "bottom", "alphabetic"]),

        // Text-mark properties
        "text": {"$ref": "#/refs/stringValue"},
        "dx": {"$ref": "#/refs/numberValue"},
        "dy": {"$ref": "#/refs/numberValue"},
        "radius":{"$ref": "#/refs/numberValue"},
        "theta": {"$ref": "#/refs/numberValue"},
        "angle": {"$ref": "#/refs/numberValue"},
        "font": {"$ref": "#/refs/stringValue"},
        "fontSize": {"$ref": "#/refs/numberValue"},
        "fontWeight": {"$ref": "#/refs/stringValue"},
        "fontStyle": {"$ref": "#/refs/stringValue"}
      },

      "additionalProperties": false
    }
  }
};


/***/ }),

/***/ "hBex":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var fielddef_1 = __webpack_require__("o+e1");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var formatParse;
(function (formatParse) {
    function parse(model) {
        var calcFieldMap = (model.transform().calculate || []).reduce(function (fieldMap, formula) {
            fieldMap[formula.field] = true;
            return fieldMap;
        }, {});
        var parseComponent = {};
        model.forEach(function (fieldDef) {
            if (fieldDef.type === type_1.TEMPORAL) {
                parseComponent[fieldDef.field] = 'date';
            }
            else if (fieldDef.type === type_1.QUANTITATIVE) {
                if (fielddef_1.isCount(fieldDef) || calcFieldMap[fieldDef.field]) {
                    return;
                }
                parseComponent[fieldDef.field] = 'number';
            }
        });
        return parseComponent;
    }
    formatParse.parseUnit = parse;
    function parseFacet(model) {
        var parseComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source && childDataComponent.formatParse) {
            util_1.extend(parseComponent, childDataComponent.formatParse);
            delete childDataComponent.formatParse;
        }
        return parseComponent;
    }
    formatParse.parseFacet = parseFacet;
    function parseLayer(model) {
        var parseComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (model.compatibleSource(child) && !util_1.differ(childDataComponent.formatParse, parseComponent)) {
                util_1.extend(parseComponent, childDataComponent.formatParse);
                delete childDataComponent.formatParse;
            }
        });
        return parseComponent;
    }
    formatParse.parseLayer = parseLayer;
})(formatParse = exports.formatParse || (exports.formatParse = {}));
//# sourceMappingURL=formatparse.js.map

/***/ }),

/***/ "hv1v":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW");

var TIME    = 'time',
    UTC     = 'utc',
    STRING  = 'string',
    ORDINAL = 'ordinal',
    NUMBER  = 'number';

function getTickFormat(scale, tickCount, tickFormatType, tickFormatString) {
  var formatType = tickFormatType || inferFormatType(scale);
  return getFormatter(scale, tickCount, formatType, tickFormatString);
}

function inferFormatType(scale) {
  switch (scale.type) {
    case TIME:    return TIME;
    case UTC:     return UTC;
    case ORDINAL: return STRING;
    default:      return NUMBER;
  }
}

// Adapted from d3 log scale
// TODO customize? replace with range-size-aware filtering?
function logFilter(scale, domain, count, f) {
  if (count == null) return f;
  var base = scale.base(),
      k = Math.min(base, scale.ticks().length / count),
      v = domain[0] > 0 ? (e = 1e-12, Math.ceil) : (e = -1e-12, Math.floor),
      e;
  function log(x) {
    return (domain[0] < 0 ?
      -Math.log(x > 0 ? 0 : -x) :
      Math.log(x < 0 ? 0 : x)) / Math.log(base);
  }
  function pow(x) {
    return domain[0] < 0 ? -Math.pow(base, -x) : Math.pow(base, x);
  }
  return function(d) {
    return pow(v(log(d) + e)) / d >= k ? f(d) : '';
  };
}

function getFormatter(scale, tickCount, formatType, str) {
  var fmt = dl.format,
      log = scale.type === 'log',
      domain;

  switch (formatType) {
    case NUMBER:
      domain = scale.domain();
      return log ?
        logFilter(scale, domain, tickCount, fmt.auto.number(str || null)) :
        fmt.auto.linear(domain, tickCount, str || null);
    case TIME: return (str ? fmt : fmt.auto).time(str);
    case UTC:  return (str ? fmt : fmt.auto).utc(str);
    default:   return String;
  }
}

module.exports = {
  getTickFormat: getTickFormat
};

/***/ }),

/***/ "iIpz":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

//# sourceMappingURL=transform.js.map

/***/ }),

/***/ "iMk1":
/***/ (function(module, exports) {

function Item(mark) {
  this.mark = mark;
}

var prototype = Item.prototype;

prototype.hasPropertySet = function(name) {
  var props = this.mark.def.properties;
  return props && props[name] != null;
};

prototype.cousin = function(offset, index) {
  if (offset === 0) return this;
  offset = offset || -1;
  var mark = this.mark,
      group = mark.group,
      iidx = index==null ? mark.items.indexOf(this) : index,
      midx = group.items.indexOf(mark) + offset;
  return group.items[midx].items[iidx];
};

prototype.sibling = function(offset) {
  if (offset === 0) return this;
  offset = offset || -1;
  var mark = this.mark,
      iidx = mark.items.indexOf(this) + offset;
  return mark.items[iidx];
};

prototype.remove = function() {
  var item = this,
      list = item.mark.items,
      i = list.indexOf(item);
  if (i >= 0) {
    if (i===list.length-1) {
      list.pop();
    } else {
      list.splice(i, 1);
    }
  }
  return item;
};

prototype.touch = function() {
  if (this.pathCache) this.pathCache = null;
};

module.exports = Item;

/***/ }),

/***/ "j8cM":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (Mark) {
    Mark[Mark["AREA"] = 'area'] = "AREA";
    Mark[Mark["BAR"] = 'bar'] = "BAR";
    Mark[Mark["LINE"] = 'line'] = "LINE";
    Mark[Mark["POINT"] = 'point'] = "POINT";
    Mark[Mark["TEXT"] = 'text'] = "TEXT";
    Mark[Mark["TICK"] = 'tick'] = "TICK";
    Mark[Mark["RULE"] = 'rule'] = "RULE";
    Mark[Mark["CIRCLE"] = 'circle'] = "CIRCLE";
    Mark[Mark["SQUARE"] = 'square'] = "SQUARE";
    Mark[Mark["ERRORBAR"] = 'errorBar'] = "ERRORBAR";
})(exports.Mark || (exports.Mark = {}));
var Mark = exports.Mark;
exports.AREA = Mark.AREA;
exports.BAR = Mark.BAR;
exports.LINE = Mark.LINE;
exports.POINT = Mark.POINT;
exports.TEXT = Mark.TEXT;
exports.TICK = Mark.TICK;
exports.RULE = Mark.RULE;
exports.CIRCLE = Mark.CIRCLE;
exports.SQUARE = Mark.SQUARE;
exports.ERRORBAR = Mark.ERRORBAR;
exports.PRIMITIVE_MARKS = [exports.AREA, exports.BAR, exports.LINE, exports.POINT, exports.TEXT, exports.TICK, exports.RULE, exports.CIRCLE, exports.SQUARE];
//# sourceMappingURL=mark.js.map

/***/ }),

/***/ "jGoH":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var encoding_1 = __webpack_require__("QSMf");
var fielddef_1 = __webpack_require__("o+e1");
var scale_1 = __webpack_require__("Fw/k");
var util_1 = __webpack_require__("ZAUf");
var NameMap = (function () {
    function NameMap() {
        this._nameMap = {};
    }
    NameMap.prototype.rename = function (oldName, newName) {
        this._nameMap[oldName] = newName;
    };
    NameMap.prototype.get = function (name) {
        while (this._nameMap[name]) {
            name = this._nameMap[name];
        }
        return name;
    };
    return NameMap;
}());
var Model = (function () {
    function Model(spec, parent, parentGivenName) {
        this._warnings = [];
        this._parent = parent;
        this._name = spec.name || parentGivenName;
        this._dataNameMap = parent ? parent._dataNameMap : new NameMap();
        this._scaleNameMap = parent ? parent._scaleNameMap : new NameMap();
        this._sizeNameMap = parent ? parent._sizeNameMap : new NameMap();
        this._data = spec.data;
        this._description = spec.description;
        this._transform = spec.transform;
        this.component = { data: null, layout: null, mark: null, scale: null, axis: null, axisGroup: null, gridGroup: null, legend: null };
    }
    Model.prototype.parse = function () {
        this.parseData();
        this.parseSelectionData();
        this.parseLayoutData();
        this.parseScale();
        this.parseAxis();
        this.parseLegend();
        this.parseAxisGroup();
        this.parseGridGroup();
        this.parseMark();
    };
    Model.prototype.assembleScales = function () {
        return util_1.flatten(util_1.vals(this.component.scale).map(function (scales) {
            var arr = [scales.main];
            if (scales.colorLegend) {
                arr.push(scales.colorLegend);
            }
            if (scales.binColorLegend) {
                arr.push(scales.binColorLegend);
            }
            return arr;
        }));
    };
    Model.prototype.assembleAxes = function () {
        return util_1.vals(this.component.axis);
    };
    Model.prototype.assembleLegends = function () {
        return util_1.vals(this.component.legend);
    };
    Model.prototype.assembleGroup = function () {
        var group = {};
        group.marks = this.assembleMarks();
        var scales = this.assembleScales();
        if (scales.length > 0) {
            group.scales = scales;
        }
        var axes = this.assembleAxes();
        if (axes.length > 0) {
            group.axes = axes;
        }
        var legends = this.assembleLegends();
        if (legends.length > 0) {
            group.legends = legends;
        }
        return group;
    };
    Model.prototype.reduce = function (f, init, t) {
        return encoding_1.channelMappingReduce(this.channels(), this.mapping(), f, init, t);
    };
    Model.prototype.forEach = function (f, t) {
        encoding_1.channelMappingForEach(this.channels(), this.mapping(), f, t);
    };
    Model.prototype.parent = function () {
        return this._parent;
    };
    Model.prototype.name = function (text, delimiter) {
        if (delimiter === void 0) { delimiter = '_'; }
        return (this._name ? this._name + delimiter : '') + text;
    };
    Model.prototype.description = function () {
        return this._description;
    };
    Model.prototype.data = function () {
        return this._data;
    };
    Model.prototype.renameData = function (oldName, newName) {
        this._dataNameMap.rename(oldName, newName);
    };
    Model.prototype.dataName = function (dataSourceType) {
        return this._dataNameMap.get(this.name(String(dataSourceType)));
    };
    Model.prototype.renameSize = function (oldName, newName) {
        this._sizeNameMap.rename(oldName, newName);
    };
    Model.prototype.channelSizeName = function (channel) {
        return this.sizeName(channel === channel_1.X || channel === channel_1.COLUMN ? 'width' : 'height');
    };
    Model.prototype.sizeName = function (size) {
        return this._sizeNameMap.get(this.name(size, '_'));
    };
    Model.prototype.transform = function () {
        return this._transform || {};
    };
    Model.prototype.field = function (channel, opt) {
        if (opt === void 0) { opt = {}; }
        var fieldDef = this.fieldDef(channel);
        if (fieldDef.bin) {
            opt = util_1.extend({
                binSuffix: this.scale(channel).type === scale_1.ScaleType.ORDINAL ? '_range' : '_start'
            }, opt);
        }
        return fielddef_1.field(fieldDef, opt);
    };
    Model.prototype.scale = function (channel) {
        return this._scale[channel];
    };
    Model.prototype.isOrdinalScale = function (channel) {
        var scale = this.scale(channel);
        return scale && scale.type === scale_1.ScaleType.ORDINAL;
    };
    Model.prototype.renameScale = function (oldName, newName) {
        this._scaleNameMap.rename(oldName, newName);
    };
    Model.prototype.scaleName = function (channel) {
        return this._scaleNameMap.get(this.name(channel + ''));
    };
    Model.prototype.sort = function (channel) {
        return (this.mapping()[channel] || {}).sort;
    };
    Model.prototype.axis = function (channel) {
        return this._axis[channel];
    };
    Model.prototype.legend = function (channel) {
        return this._legend[channel];
    };
    Model.prototype.config = function () {
        return this._config;
    };
    Model.prototype.addWarning = function (message) {
        util_1.warning(message);
        this._warnings.push(message);
    };
    Model.prototype.warnings = function () {
        return this._warnings;
    };
    Model.prototype.isUnit = function () {
        return false;
    };
    Model.prototype.isFacet = function () {
        return false;
    };
    Model.prototype.isLayer = function () {
        return false;
    };
    return Model;
}());
exports.Model = Model;
//# sourceMappingURL=model.js.map

/***/ }),

/***/ "jMte":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var data_1 = __webpack_require__("x6Fv");
var util_1 = __webpack_require__("ZAUf");
var nullfilter_1 = __webpack_require__("t3C9");
var filter_1 = __webpack_require__("1PdY");
var bin_1 = __webpack_require__("nOes");
var formula_1 = __webpack_require__("pAWG");
var timeunit_1 = __webpack_require__("736r");
var source;
(function (source) {
    function parse(model) {
        var data = model.data();
        if (data) {
            var sourceData = { name: model.dataName(data_1.SOURCE) };
            if (data.values && data.values.length > 0) {
                sourceData.values = data.values;
                sourceData.format = { type: 'json' };
            }
            else if (data.url) {
                sourceData.url = data.url;
                var defaultExtension = /(?:\.([^.]+))?$/.exec(sourceData.url)[1];
                if (!util_1.contains(['json', 'csv', 'tsv', 'topojson'], defaultExtension)) {
                    defaultExtension = 'json';
                }
                var dataFormat = data.format || {};
                var formatType = dataFormat.type || data['formatType'];
                sourceData.format =
                    util_1.extend({ type: formatType ? formatType : defaultExtension }, dataFormat.property ? { property: dataFormat.property } : {}, dataFormat.feature ?
                        { feature: dataFormat.feature } :
                        dataFormat.mesh ?
                            { mesh: dataFormat.mesh } :
                            {});
            }
            return sourceData;
        }
        else if (!model.parent()) {
            return { name: model.dataName(data_1.SOURCE) };
        }
        return undefined;
    }
    source.parseUnit = parse;
    function parseFacet(model) {
        var sourceData = parse(model);
        if (!model.child().component.data.source) {
            model.child().renameData(model.child().dataName(data_1.SOURCE), model.dataName(data_1.SOURCE));
        }
        return sourceData;
    }
    source.parseFacet = parseFacet;
    function parseLayer(model) {
        var sourceData = parse(model);
        model.children().forEach(function (child) {
            var childData = child.component.data;
            if (model.compatibleSource(child)) {
                var canMerge = !childData.filter && !childData.formatParse && !childData.nullFilter;
                if (canMerge) {
                    child.renameData(child.dataName(data_1.SOURCE), model.dataName(data_1.SOURCE));
                    delete childData.source;
                }
                else {
                    childData.source = {
                        name: child.dataName(data_1.SOURCE),
                        source: model.dataName(data_1.SOURCE)
                    };
                }
            }
        });
        return sourceData;
    }
    source.parseLayer = parseLayer;
    function assemble(model, component) {
        if (component.source) {
            var sourceData = component.source;
            if (component.formatParse) {
                component.source.format = component.source.format || {};
                component.source.format.parse = component.formatParse;
            }
            sourceData.transform = [].concat(nullfilter_1.nullFilter.assemble(component), formula_1.formula.assemble(component), filter_1.filter.assemble(component), bin_1.bin.assemble(component), timeunit_1.timeUnit.assemble(component));
            return sourceData;
        }
        return null;
    }
    source.assemble = assemble;
})(source = exports.source || (exports.source = {}));
//# sourceMappingURL=source.js.map

/***/ }),

/***/ "jNWb":
/***/ (function(module, exports, __webpack_require__) {

var parser = __webpack_require__("H3bJ"),
    codegen = __webpack_require__("4XOj");

var expr = module.exports = {
  parse: function(input, opt) {
      return parser.parse('('+input+')', opt);
    },
  code: function(opt) {
      return codegen(opt);
    },
  compiler: function(args, opt) {
      args = args.slice();
      var generator = codegen(opt),
          len = args.length,
          compile = function(str) {
            var value = generator(expr.parse(str));
            args[len] = '"use strict"; return (' + value.code + ');';
            var fn = Function.apply(null, args);
            value.fn = (args.length > 8) ?
              function() { return fn.apply(value, arguments); } :
              function(a, b, c, d, e, f, g) {
                return fn.call(value, a, b, c, d, e, f, g);
              }; // call often faster than apply, use if args low enough
            return value;
          };
      compile.codegen = generator;
      return compile;
    },
  functions: __webpack_require__("nj7R"),
  constants: __webpack_require__("MSrK")
};

/***/ }),

/***/ "jbgm":
/***/ (function(module, exports, __webpack_require__) {

var json = __webpack_require__("cwb4");

module.exports = function(tree, format) {
  return toTable(json(tree, format), format);
};

function toTable(root, fields) {
  var childrenField = fields && fields.children || 'children',
      parentField = fields && fields.parent || 'parent',
      table = [];

  function visit(node, parent) {
    node[parentField] = parent;
    table.push(node);
    var children = node[childrenField];
    if (children) {
      for (var i=0; i<children.length; ++i) {
        visit(children[i], node);
      }
    }
  }

  visit(root, null);
  return (table.root = root, table);
}


/***/ }),

/***/ "juLC":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    ChangeSet = df.ChangeSet,
    Tuple = df.Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Cross(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    with: {type: 'data'},
    diagonal: {type: 'value', default: 'true'},
    filter: {type: 'expr'}
  });

  this._output = {'left': 'a', 'right': 'b'};
  this._lastWith = null; // Last time we crossed w/with-ds.
  this._cids  = {};
  this._cache = {};

  return this.router(true).produces(true);
}

var prototype = (Cross.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Cross;

// Each cached incoming tuple also has a flag to determine whether
// any tuples were filtered.
function _cache(x, t) {
  var c = this._cache,
      cross = c[x._id] || (c[x._id] = {c: [], f: false});
  cross.c.push(t);
}

function _cid(left, x, y) {
  return left ? x._id+'_'+y._id : y._id+'_'+x._id;
}

function add(output, left, data, diag, test, mids, x) {
  var as = this._output,
      cache = this._cache,
      cids  = this._cids,
      oadd  = output.add,
      fltrd = false,
      i = 0, len = data.length,
      t = {}, y, cid;

  for (; i<len; ++i) {
    y = data[i];
    cid = _cid(left, x, y);
    if (cids[cid]) continue;
    if (x._id === y._id && !diag) continue;

    Tuple.set(t, as.left, left ? x : y);
    Tuple.set(t, as.right, left ? y : x);

    // Only ingest a tuple if we keep it around. Otherwise, flag the
    // caches as filtered.
    if (!test || test(t)) {
      oadd.push(t=Tuple.ingest(t));
      _cache.call(this, x, t);
      if (x._id !== y._id) _cache.call(this, y, t);
      mids[t._id] = 1;
      cids[cid] = true;
      t = {};
    } else {
      if (cache[y._id]) cache[y._id].f = true;
      fltrd = true;
    }
  }

  if (cache[x._id]) cache[x._id].f = fltrd;
}

function mod(output, left, data, diag, test, mids, rids, x) {
  var as = this._output,
      cache = this._cache,
      cids  = this._cids,
      cross = cache[x._id],
      tpls  = cross && cross.c,
      fltrd = !cross || cross.f,
      omod  = output.mod,
      orem  = output.rem,
      i, t, y, l, cid;

  // If we have cached values, iterate through them for lazy
  // removal, and to re-run the filter.
  if (tpls) {
    for (i=tpls.length-1; i>=0; --i) {
      t = tpls[i];
      l = x === t[as.left]; // Cache has tpls w/x both on left & right.
      y = l ? t[as.right] : t[as.left];
      cid = _cid(l, x, y);

      // Lazy removal: y was previously rem'd, so clean up the cache.
      if (!cache[y._id]) {
        cids[cid] = false;
        tpls.splice(i, 1);
        continue;
      }

      if (!test || test(t)) {
        if (mids[t._id]) continue;
        omod.push(t);
        mids[t._id] = 1;
      } else {
        if (!rids[t._id]) orem.push.apply(orem, tpls.splice(i, 1));
        rids[t._id] = 1;
        cids[cid] = false;
        cross.f = true;
      }
    }
  }

  // If we have a filter param, call add to catch any tuples that may
  // have previously been filtered.
  if (test && fltrd) add.call(this, output, left, data, diag, test, mids, x);
}

function rem(output, left, rids, x) {
  var as = this._output,
      cross = this._cache[x._id],
      cids  = this._cids,
      orem  = output.rem,
      i, len, t, y, l;
  if (!cross) return;

  for (i=0, len=cross.c.length; i<len; ++i) {
    t = cross.c[i];
    l = x === t[as.left];
    y = l ? t[as.right] : t[as.left];
    cids[_cid(l, x, y)] = false;
    if (!rids[t._id]) {
      orem.push(t);
      rids[t._id] = 1;
    }
  }

  this._cache[x._id] = null;
}

function purge(output, rids) {
  var cache = this._cache,
      keys  = dl.keys(cache),
      rem = output.rem,
      i, len, j, jlen, cross, t;

  for (i=0, len=keys.length; i<len; ++i) {
    cross = cache[keys[i]];
    for (j=0, jlen=cross.c.length; j<jlen; ++j) {
      t = cross.c[j];
      if (rids[t._id]) continue;
      rem.push(t);
      rids[t._id] = 1;
    }
  }

  this._cache = {};
  this._cids = {};
  this._lastWith = null;
}

prototype.batchTransform = function(input, data, reset) {
  log.debug(input, ['crossing']);

  var w = this.param('with'),
      diag = this.param('diagonal'),
      as = this._output,
      test = this.param('filter') || null,
      selfCross = (!w.name),
      woutput = selfCross ? input : w.source.last(),
      wdata   = selfCross ? data : w.source.values(),
      output  = ChangeSet.create(input),
      mids = {}, rids = {}; // Track IDs to prevent dupe mod/rem tuples.

  // If signal values (for diag or test) have changed, purge the cache
  // and re-run cross in batch mode. Otherwise stream cross values.
  if (reset) {
    purge.call(this, output, rids);
    data.forEach(add.bind(this, output, true, wdata, diag, test, mids));
    this._lastWith = woutput.stamp;
  } else {
    input.rem.forEach(rem.bind(this, output, true, rids));
    input.add.forEach(add.bind(this, output, true, wdata, diag, test, mids));

    if (woutput.stamp > this._lastWith) {
      woutput.rem.forEach(rem.bind(this, output, false, rids));
      woutput.add.forEach(add.bind(this, output, false, data, diag, test, mids));
      woutput.mod.forEach(mod.bind(this, output, false, data, diag, test, mids, rids));
      this._lastWith = woutput.stamp;
    }

    // Mods need to come after all removals have been run.
    input.mod.forEach(mod.bind(this, output, true, wdata, diag, test, mids, rids));
  }

  output.fields[as.left]  = 1;
  output.fields[as.right] = 1;
  return output;
};

module.exports = Cross;

Cross.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Cross transform",
  "description": "Compute the cross-product of two data sets.",
  "type": "object",
  "properties": {
    "type": {"enum": ["cross"]},
    "with": {
      "type": "string",
      "description": "The name of the secondary data set to cross with the primary data. " +
        "If unspecified, the primary data is crossed with itself."
    },
    "diagonal": {
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "description": "If false, items along the \"diagonal\" of the cross-product " +
        "(those elements with the same index in their respective array) " +
        "will not be included in the output.",
      "default": true
    },
    "filter": {
      "type": "string",
      "description": "A string containing an expression (in JavaScript syntax) " +
        "to filter the resulting data elements."
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "left": {"type": "string", "default": "a"},
        "right": {"type": "string", "default": "b"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "jxr4":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var mark_1 = __webpack_require__("j8cM");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var common_1 = __webpack_require__("MtYt");
var scale_1 = __webpack_require__("TLMq");
function parseLegendComponent(model) {
    return [channel_1.COLOR, channel_1.SIZE, channel_1.SHAPE].reduce(function (legendComponent, channel) {
        if (model.legend(channel)) {
            legendComponent[channel] = parseLegend(model, channel);
        }
        return legendComponent;
    }, {});
}
exports.parseLegendComponent = parseLegendComponent;
function getLegendDefWithScale(model, channel) {
    switch (channel) {
        case channel_1.COLOR:
            var fieldDef = model.fieldDef(channel_1.COLOR);
            var scale = model.scaleName(useColorLegendScale(fieldDef) ?
                scale_1.COLOR_LEGEND :
                channel_1.COLOR);
            return model.config().mark.filled ? { fill: scale } : { stroke: scale };
        case channel_1.SIZE:
            return { size: model.scaleName(channel_1.SIZE) };
        case channel_1.SHAPE:
            return { shape: model.scaleName(channel_1.SHAPE) };
    }
    return null;
}
function parseLegend(model, channel) {
    var fieldDef = model.fieldDef(channel);
    var legend = model.legend(channel);
    var config = model.config();
    var def = getLegendDefWithScale(model, channel);
    def.title = title(legend, fieldDef, config);
    var format = common_1.numberFormat(fieldDef, legend.format, config);
    if (format) {
        def.format = format;
    }
    ['offset', 'orient', 'values'].forEach(function (property) {
        var value = legend[property];
        if (value !== undefined) {
            def[property] = value;
        }
    });
    var props = (typeof legend !== 'boolean' && legend.properties) || {};
    ['title', 'symbols', 'legend', 'labels'].forEach(function (group) {
        var value = properties[group] ?
            properties[group](fieldDef, props[group], model, channel) :
            props[group];
        if (value !== undefined && util_1.keys(value).length > 0) {
            def.properties = def.properties || {};
            def.properties[group] = value;
        }
    });
    return def;
}
exports.parseLegend = parseLegend;
function title(legend, fieldDef, config) {
    if (typeof legend !== 'boolean' && legend.title) {
        return legend.title;
    }
    return fielddef_1.title(fieldDef, config);
}
exports.title = title;
function useColorLegendScale(fieldDef) {
    return fieldDef.type === type_1.ORDINAL || fieldDef.bin || fieldDef.timeUnit;
}
exports.useColorLegendScale = useColorLegendScale;
var properties;
(function (properties) {
    function symbols(fieldDef, symbolsSpec, model, channel) {
        var symbols = {};
        var mark = model.mark();
        var legend = model.legend(channel);
        switch (mark) {
            case mark_1.BAR:
            case mark_1.TICK:
            case mark_1.TEXT:
                symbols.shape = { value: 'square' };
                break;
            case mark_1.CIRCLE:
            case mark_1.SQUARE:
                symbols.shape = { value: mark };
                break;
            case mark_1.POINT:
            case mark_1.LINE:
            case mark_1.AREA:
                break;
        }
        var filled = model.config().mark.filled;
        var config = channel === channel_1.COLOR ?
            util_1.without(common_1.FILL_STROKE_CONFIG, [filled ? 'fill' : 'stroke', 'strokeDash', 'strokeDashOffset']) :
            util_1.without(common_1.FILL_STROKE_CONFIG, ['strokeDash', 'strokeDashOffset']);
        config = util_1.without(config, ['strokeDash', 'strokeDashOffset']);
        common_1.applyMarkConfig(symbols, model, config);
        if (filled) {
            symbols.strokeWidth = { value: 0 };
        }
        var value;
        if (model.has(channel_1.COLOR) && channel === channel_1.COLOR) {
            if (useColorLegendScale(fieldDef)) {
                value = { scale: model.scaleName(channel_1.COLOR), field: 'data' };
            }
        }
        else if (model.fieldDef(channel_1.COLOR).value) {
            value = { value: model.fieldDef(channel_1.COLOR).value };
        }
        if (value !== undefined) {
            if (filled) {
                symbols.fill = value;
            }
            else {
                symbols.stroke = value;
            }
        }
        else if (channel !== channel_1.COLOR) {
            symbols[filled ? 'fill' : 'stroke'] = symbols[filled ? 'fill' : 'stroke'] ||
                { value: model.config().mark.color };
        }
        if (legend.symbolColor !== undefined) {
            symbols.fill = { value: legend.symbolColor };
        }
        if (legend.symbolShape !== undefined) {
            symbols.shape = { value: legend.symbolShape };
        }
        if (legend.symbolSize !== undefined) {
            symbols.size = { value: legend.symbolSize };
        }
        if (legend.symbolStrokeWidth !== undefined) {
            symbols.strokeWidth = { value: legend.symbolStrokeWidth };
        }
        symbols = util_1.extend(symbols, symbolsSpec || {});
        return util_1.keys(symbols).length > 0 ? symbols : undefined;
    }
    properties.symbols = symbols;
    function labels(fieldDef, labelsSpec, model, channel) {
        var legend = model.legend(channel);
        var config = model.config();
        var labels = {};
        if (channel === channel_1.COLOR) {
            if (fieldDef.type === type_1.ORDINAL) {
                labelsSpec = util_1.extend({
                    text: {
                        scale: model.scaleName(scale_1.COLOR_LEGEND),
                        field: 'data'
                    }
                }, labelsSpec || {});
            }
            else if (fieldDef.bin) {
                labelsSpec = util_1.extend({
                    text: {
                        scale: model.scaleName(scale_1.COLOR_LEGEND_LABEL),
                        field: 'data'
                    }
                }, labelsSpec || {});
            }
            else if (fieldDef.type === type_1.TEMPORAL) {
                labelsSpec = util_1.extend({
                    text: {
                        template: common_1.timeTemplate('datum.data', fieldDef.timeUnit, legend.format, legend.shortTimeLabels, config)
                    }
                }, labelsSpec || {});
            }
        }
        if (legend.labelAlign !== undefined) {
            labels.align = { value: legend.labelAlign };
        }
        if (legend.labelColor !== undefined) {
            labels.stroke = { value: legend.labelColor };
        }
        if (legend.labelFont !== undefined) {
            labels.font = { value: legend.labelFont };
        }
        if (legend.labelFontSize !== undefined) {
            labels.fontSize = { value: legend.labelFontSize };
        }
        if (legend.labelBaseline !== undefined) {
            labels.baseline = { value: legend.labelBaseline };
        }
        labels = util_1.extend(labels, labelsSpec || {});
        return util_1.keys(labels).length > 0 ? labels : undefined;
    }
    properties.labels = labels;
    function title(fieldDef, titleSpec, model, channel) {
        var legend = model.legend(channel);
        var titles = {};
        if (legend.titleColor !== undefined) {
            titles.stroke = { value: legend.titleColor };
        }
        if (legend.titleFont !== undefined) {
            titles.font = { value: legend.titleFont };
        }
        if (legend.titleFontSize !== undefined) {
            titles.fontSize = { value: legend.titleFontSize };
        }
        if (legend.titleFontWeight !== undefined) {
            titles.fontWeight = { value: legend.titleFontWeight };
        }
        titles = util_1.extend(titles, titleSpec || {});
        return util_1.keys(titles).length > 0 ? titles : undefined;
    }
    properties.title = title;
})(properties = exports.properties || (exports.properties = {}));
//# sourceMappingURL=legend.js.map

/***/ }),

/***/ "jyAW":
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
var noop = {value: function() {}};

function dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || (t in _)) throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}

function Dispatch(_) {
  this._ = _;
}

function parseTypenames(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
    if (t && !types.hasOwnProperty(t)) throw new Error("unknown type: " + t);
    return {type: t, name: name};
  });
}

Dispatch.prototype = dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._,
        T = parseTypenames(typename + "", _),
        t,
        i = -1,
        n = T.length;

    // If no callback was specified, return the callback of the given type and name.
    if (arguments.length < 2) {
      while (++i < n) if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name))) return t;
      return;
    }

    // If a type was specified, set the callback for the given type and name.
    // Otherwise, if a null callback was specified, remove callbacks of the given name.
    if (callback != null && typeof callback !== "function") throw new Error("invalid callback: " + callback);
    while (++i < n) {
      if (t = (typename = T[i]).type) _[t] = set(_[t], typename.name, callback);
      else if (callback == null) for (t in _) _[t] = set(_[t], typename.name, null);
    }

    return this;
  },
  copy: function() {
    var copy = {}, _ = this._;
    for (var t in _) copy[t] = _[t].slice();
    return new Dispatch(copy);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0) for (var args = new Array(n), i = 0, n, t; i < n; ++i) args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type)) throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i) t[i].value.apply(that, args);
  }
};

function get(type, name) {
  for (var i = 0, n = type.length, c; i < n; ++i) {
    if ((c = type[i]).name === name) {
      return c.value;
    }
  }
}

function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i) {
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  }
  if (callback != null) type.push({name: name, value: callback});
  return type;
}

/* harmony default export */ __webpack_exports__["a"] = (dispatch);


/***/ }),

/***/ "k2D6":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var common_1 = __webpack_require__("MtYt");
var area;
(function (area) {
    function markType() {
        return 'area';
    }
    area.markType = markType;
    function properties(model) {
        var p = {};
        var config = model.config();
        var orient = config.mark.orient;
        if (orient) {
            p.orient = { value: orient };
        }
        var stack = model.stack();
        var _x = x(model.encoding().x, model.scaleName(channel_1.X), orient, stack);
        if (_x) {
            p.x = _x;
        }
        var _y = y(model.encoding().y, model.scaleName(channel_1.Y), orient, stack);
        if (_y) {
            p.y = _y;
        }
        var _x2 = x2(model.encoding().x, model.encoding().x2, model.scaleName(channel_1.X), orient, stack);
        if (_x2) {
            p.x2 = _x2;
        }
        var _y2 = y2(model.encoding().y, model.encoding().y2, model.scaleName(channel_1.Y), orient, stack);
        if (_y2) {
            p.y2 = _y2;
        }
        common_1.applyColorAndOpacity(p, model);
        common_1.applyMarkConfig(p, model, ['interpolate', 'tension']);
        return p;
    }
    area.properties = properties;
    function x(fieldDef, scaleName, orient, stack) {
        if (stack && channel_1.X === stack.fieldChannel) {
            return {
                scale: scaleName,
                field: fielddef_1.field(fieldDef, { suffix: '_start' })
            };
        }
        else if (fielddef_1.isMeasure(fieldDef)) {
            if (orient === 'horizontal') {
                if (fieldDef && fieldDef.field) {
                    return {
                        scale: scaleName,
                        field: fielddef_1.field(fieldDef)
                    };
                }
                else {
                    return {
                        scale: scaleName,
                        value: 0
                    };
                }
            }
            else {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef)
                };
            }
        }
        else if (fielddef_1.isDimension(fieldDef)) {
            return {
                scale: scaleName,
                field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
            };
        }
        return undefined;
    }
    area.x = x;
    function x2(xFieldDef, x2FieldDef, scaleName, orient, stack) {
        if (stack && channel_1.X === stack.fieldChannel) {
            if (orient === 'horizontal') {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(xFieldDef, { suffix: '_end' })
                };
            }
        }
        else if (fielddef_1.isMeasure(x2FieldDef)) {
            if (orient === 'horizontal') {
                if (x2FieldDef && x2FieldDef.field) {
                    return {
                        scale: scaleName,
                        field: fielddef_1.field(x2FieldDef)
                    };
                }
                else {
                    return {
                        scale: scaleName,
                        value: 0
                    };
                }
            }
        }
        return undefined;
    }
    area.x2 = x2;
    function y(fieldDef, scaleName, orient, stack) {
        if (stack && channel_1.Y === stack.fieldChannel) {
            return {
                scale: scaleName,
                field: fielddef_1.field(fieldDef, { suffix: '_start' })
            };
        }
        else if (fielddef_1.isMeasure(fieldDef)) {
            if (orient !== 'horizontal') {
                if (fieldDef && fieldDef.field) {
                    return {
                        scale: scaleName,
                        field: fielddef_1.field(fieldDef)
                    };
                }
                else {
                    return { field: { group: 'height' } };
                }
            }
            else {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef)
                };
            }
        }
        else if (fielddef_1.isDimension(fieldDef)) {
            return {
                scale: scaleName,
                field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
            };
        }
        return undefined;
    }
    area.y = y;
    function y2(yFieldDef, y2FieldDef, scaleName, orient, stack) {
        if (stack && channel_1.Y === stack.fieldChannel) {
            if (orient !== 'horizontal') {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(yFieldDef, { suffix: '_end' })
                };
            }
        }
        else if (fielddef_1.isMeasure(yFieldDef)) {
            if (orient !== 'horizontal') {
                if (y2FieldDef && y2FieldDef.field) {
                    return {
                        scale: scaleName,
                        field: fielddef_1.field(y2FieldDef)
                    };
                }
                else {
                    return {
                        scale: scaleName,
                        value: 0
                    };
                }
            }
        }
        return undefined;
    }
    area.y2 = y2;
    function labels(model) {
        return undefined;
    }
    area.labels = labels;
})(area = exports.area || (exports.area = {}));
//# sourceMappingURL=area.js.map

/***/ }),

/***/ "k66X":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var time_1 = __webpack_require__("wKIX");
var timeUnitDomain;
(function (timeUnitDomain) {
    function parse(model) {
        return model.reduce(function (timeUnitDomainMap, fieldDef, channel) {
            if (fieldDef.timeUnit) {
                var domain = time_1.rawDomain(fieldDef.timeUnit, channel);
                if (domain) {
                    timeUnitDomainMap[fieldDef.timeUnit] = true;
                }
            }
            return timeUnitDomainMap;
        }, {});
    }
    timeUnitDomain.parseUnit = parse;
    function parseFacet(model) {
        return util_1.extend(parse(model), model.child().component.data.timeUnitDomain);
    }
    timeUnitDomain.parseFacet = parseFacet;
    function parseLayer(model) {
        return util_1.extend(parse(model), model.children().forEach(function (child) {
            return child.component.data.timeUnitDomain;
        }));
    }
    timeUnitDomain.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.keys(component.timeUnitDomain).reduce(function (timeUnitData, tu) {
            var timeUnit = tu;
            var domain = time_1.rawDomain(timeUnit, null);
            if (domain) {
                timeUnitData.push({
                    name: timeUnit,
                    values: domain,
                    transform: [{
                            type: 'formula',
                            field: 'date',
                            expr: time_1.parseExpression(timeUnit, 'datum.data', true)
                        }]
                });
            }
            return timeUnitData;
        }, []);
    }
    timeUnitDomain.assemble = assemble;
})(timeUnitDomain = exports.timeUnitDomain || (exports.timeUnitDomain = {}));
//# sourceMappingURL=timeunitdomain.js.map

/***/ }),

/***/ "kC7m":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  arc:    __webpack_require__("evf9"),
  area:   __webpack_require__("lTFi"),
  group:  __webpack_require__("ZCPb"),
  image:  __webpack_require__("9+55"),
  line:   __webpack_require__("eVGq"),
  path:   __webpack_require__("7Zus"),
  rect:   __webpack_require__("HaGw"),
  rule:   __webpack_require__("qnrb"),
  symbol: __webpack_require__("zPnY"),
  text:   __webpack_require__("Wd6V")
};


/***/ }),

/***/ "kowr":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var data_1 = __webpack_require__("x6Fv");
var fielddef_1 = __webpack_require__("o+e1");
var stackScale;
(function (stackScale) {
    function parseUnit(model) {
        var stackProps = model.stack();
        if (stackProps) {
            var groupbyChannel = stackProps.groupbyChannel;
            var fieldChannel = stackProps.fieldChannel;
            return {
                name: model.dataName(data_1.STACKED_SCALE),
                source: model.dataName(data_1.SUMMARY),
                transform: [{
                        type: 'aggregate',
                        groupby: [model.field(groupbyChannel)],
                        summarize: [{ ops: ['sum'], field: model.field(fieldChannel) }]
                    }]
            };
        }
        return null;
    }
    stackScale.parseUnit = parseUnit;
    ;
    function parseFacet(model) {
        var child = model.child();
        var childDataComponent = child.component.data;
        if (!childDataComponent.source && childDataComponent.stackScale) {
            var stackComponent = childDataComponent.stackScale;
            var newName = model.dataName(data_1.STACKED_SCALE);
            child.renameData(stackComponent.name, newName);
            stackComponent.name = newName;
            stackComponent.source = model.dataName(data_1.SUMMARY);
            stackComponent.transform[0].groupby = model.reduce(function (groupby, fieldDef) {
                groupby.push(fielddef_1.field(fieldDef));
                return groupby;
            }, stackComponent.transform[0].groupby);
            delete childDataComponent.stackScale;
            return stackComponent;
        }
        return null;
    }
    stackScale.parseFacet = parseFacet;
    function parseLayer(model) {
        return null;
    }
    stackScale.parseLayer = parseLayer;
    function assemble(component) {
        return component.stackScale;
    }
    stackScale.assemble = assemble;
})(stackScale = exports.stackScale || (exports.stackScale = {}));
//# sourceMappingURL=stackscale.js.map

/***/ }),

/***/ "lKLM":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    parseMark = __webpack_require__("SbOu"),
    util = __webpack_require__("v0Fq");

var axisBounds = new (__webpack_require__("LHV8").Bounds)();
var ORDINAL = 'ordinal';

function axs(model, config) {
  var scale,
      orient = config.orient,
      offset = 0,
      titleOffset = config.titleOffset,
      axisDef = {},
      layer = 'front',
      grid = false,
      title = null,
      tickMajorSize = config.tickSize,
      tickMinorSize = config.tickSize,
      tickEndSize = config.tickSize,
      tickPadding = config.tickPadding || config.padding,
      tickValues = null,
      tickFormatString = null,
      tickFormatType = null,
      tickSubdivide = 0,
      tickCount = config.ticks,
      gridLineStyle = {},
      tickLabelStyle = {},
      majorTickStyle = {},
      minorTickStyle = {},
      titleStyle = {},
      domainStyle = {},
      m = { // Axis marks as references for updates
        gridLines:  {},
        majorTicks: {},
        minorTicks: {},
        tickLabels: {},
        domain: {},
        title:  {}
      };

  var axis = {};

  function reset() {
    axisDef.type = null;
  }

  function ingest(d) {
    return {data: d};
  }

  function getTicks(format) {
    var major = tickValues || (scale.ticks ? scale.ticks(tickCount) : scale.domain()),
        minor = axisSubdivide(scale, major, tickSubdivide).map(ingest);
    major = major.map(function(d) { return (d = ingest(d), d.label = format(d.data), d); });
    return [major, minor];
  }

  axis.def = function() {
    if (!axisDef.type) axis_def(scale);

    var format = util.getTickFormat(scale, tickCount, tickFormatType, tickFormatString),
        ticks  = getTicks(format),
        tdata  = title ? [title].map(ingest) : [];

    axisDef.marks[0].from = function() { return grid ? ticks[0] : []; };
    axisDef.marks[1].from = function() { return ticks[0]; };
    axisDef.marks[2].from = function() { return ticks[1]; };
    axisDef.marks[3].from = axisDef.marks[1].from;
    axisDef.marks[4].from = function() { return [1]; };
    axisDef.marks[5].from = function() { return tdata; };
    axisDef.offset = offset;
    axisDef.orient = orient;
    axisDef.layer = layer;
    if (titleOffset === 'auto') titleAutoOffset(axisDef);

    return axisDef;
  };

  function titleAutoOffset(axisDef) {
    var orient = axisDef.orient,
        update = axisDef.marks[5].properties.update,
        fn = update.encode,
        min = config.titleOffsetAutoMin,
        max = config.titleOffsetAutoMax,
        pad = config.titleOffsetAutoMargin;

    // Offset axis title using bounding box of axis domain and labels
    // Assumes other components are **encoded and bounded** beforehand
    update.encode = function(item, group, trans, db, signals, preds) {
      var dirty = fn.call(fn, item, group, trans, db, signals, preds),
          field = (orient==='bottom' || orient==='top') ? 'y' : 'x';
      if (titleStyle[field] != null) return dirty;

      axisBounds.clear()
        .union(group.items[3].bounds)
        .union(group.items[4].bounds);

      var o = trans ? {} : item,
          method = (orient==='left' || orient==='right') ? 'width' : 'height',
          sign = (orient==='top' || orient==='left') ? -1 : 1,
          off = ~~(axisBounds[method]() + item.fontSize/2 + pad);

      Tuple.set(o, field, sign * Math.min(Math.max(min, off), max));
      if (trans) trans.interpolate(item, o);
      return true;
    };
  }

  function axis_def(scale) {
    // setup scale mapping
    var newScale, oldScale, range;
    if (scale.type === ORDINAL) {
      newScale = {scale: scale.scaleName, offset: 0.5 + scale.rangeBand()/2};
      oldScale = newScale;
    } else {
      newScale = {scale: scale.scaleName, offset: 0.5};
      oldScale = {scale: scale.scaleName+':prev', offset: 0.5};
    }
    range = axisScaleRange(scale);

    // setup axis marks
    dl.extend(m.gridLines, axisTicks(config));
    dl.extend(m.majorTicks, axisTicks(config));
    dl.extend(m.minorTicks, axisTicks(config));
    dl.extend(m.tickLabels, axisTickLabels(config));
    dl.extend(m.domain, axisDomain(config));
    dl.extend(m.title, axisTitle(config));
    m.gridLines.properties.enter.stroke = {value: config.gridColor};
    m.gridLines.properties.enter.strokeOpacity = {value: config.gridOpacity};
    m.gridLines.properties.enter.strokeWidth = {value: config.gridWidth};
    m.gridLines.properties.enter.strokeDash = {value: config.gridDash};

    // extend axis marks based on axis orientation
    axisTicksExtend(orient, m.gridLines, oldScale, newScale, Infinity, scale, config, offset);
    axisTicksExtend(orient, m.majorTicks, oldScale, newScale, tickMajorSize, scale, config);
    axisTicksExtend(orient, m.minorTicks, oldScale, newScale, tickMinorSize, scale, config);

    axisLabelExtend(orient, m.tickLabels, oldScale, newScale, tickMajorSize, tickPadding);

    axisDomainExtend(orient, m.domain, range, tickEndSize);
    axisTitleExtend(orient, m.title, range, +titleOffset || -1);

    // add / override custom style properties
    dl.extend(m.gridLines.properties.update, gridLineStyle);
    dl.extend(m.majorTicks.properties.update, majorTickStyle);
    dl.extend(m.minorTicks.properties.update, minorTickStyle);
    dl.extend(m.tickLabels.properties.update, tickLabelStyle);
    dl.extend(m.domain.properties.update, domainStyle);
    dl.extend(m.title.properties.update, titleStyle);

    var marks = [m.gridLines, m.majorTicks, m.minorTicks, m.tickLabels, m.domain, m.title];
    dl.extend(axisDef, {
      type: 'group',
      interactive: false,
      properties: {
        enter: {
          encode: axisUpdate,
          scales: [scale.scaleName],
          signals: [], data: []
        },
        update: {
          encode: axisUpdate,
          scales: [scale.scaleName],
          signals: [], data: []
        }
      }
    });

    axisDef.marks = marks.map(function(m) { return parseMark(model, m); });
  }

  axis.scale = function(x) {
    if (!arguments.length) return scale;
    if (scale !== x) { scale = x; reset(); }
    return axis;
  };

  axis.orient = function(x) {
    if (!arguments.length) return orient;
    if (orient !== x) {
      orient = x in axisOrients ? x + '' : config.orient;
      reset();
    }
    return axis;
  };

  axis.title = function(x) {
    if (!arguments.length) return title;
    if (title !== x) { title = x; reset(); }
    return axis;
  };

  axis.tickCount = function(x) {
    if (!arguments.length) return tickCount;
    tickCount = x;
    return axis;
  };

  axis.tickValues = function(x) {
    if (!arguments.length) return tickValues;
    tickValues = x;
    return axis;
  };

  axis.tickFormat = function(x) {
    if (!arguments.length) return tickFormatString;
    if (tickFormatString !== x) {
      tickFormatString = x;
      reset();
    }
    return axis;
  };

  axis.tickFormatType = function(x) {
    if (!arguments.length) return tickFormatType;
    if (tickFormatType !== x) {
      tickFormatType = x;
      reset();
    }
    return axis;
  };

  axis.tickSize = function(x, y) {
    if (!arguments.length) return tickMajorSize;
    var n = arguments.length - 1,
        major = +x,
        minor = n > 1 ? +y : tickMajorSize,
        end   = n > 0 ? +arguments[n] : tickMajorSize;

    if (tickMajorSize !== major ||
        tickMinorSize !== minor ||
        tickEndSize !== end) {
      reset();
    }

    tickMajorSize = major;
    tickMinorSize = minor;
    tickEndSize = end;
    return axis;
  };

  axis.tickSubdivide = function(x) {
    if (!arguments.length) return tickSubdivide;
    tickSubdivide = +x;
    return axis;
  };

  axis.offset = function(x) {
    if (!arguments.length) return offset;
    offset = dl.isObject(x) ? x : +x;
    return axis;
  };

  axis.tickPadding = function(x) {
    if (!arguments.length) return tickPadding;
    if (tickPadding !== +x) { tickPadding = +x; reset(); }
    return axis;
  };

  axis.titleOffset = function(x) {
    if (!arguments.length) return titleOffset;
    if (titleOffset !== x) { titleOffset = x; reset(); }
    return axis;
  };

  axis.layer = function(x) {
    if (!arguments.length) return layer;
    if (layer !== x) { layer = x; reset(); }
    return axis;
  };

  axis.grid = function(x) {
    if (!arguments.length) return grid;
    if (grid !== x) { grid = x; reset(); }
    return axis;
  };

  axis.gridLineProperties = function(x) {
    if (!arguments.length) return gridLineStyle;
    if (gridLineStyle !== x) { gridLineStyle = x; }
    return axis;
  };

  axis.majorTickProperties = function(x) {
    if (!arguments.length) return majorTickStyle;
    if (majorTickStyle !== x) { majorTickStyle = x; }
    return axis;
  };

  axis.minorTickProperties = function(x) {
    if (!arguments.length) return minorTickStyle;
    if (minorTickStyle !== x) { minorTickStyle = x; }
    return axis;
  };

  axis.tickLabelProperties = function(x) {
    if (!arguments.length) return tickLabelStyle;
    if (tickLabelStyle !== x) { tickLabelStyle = x; }
    return axis;
  };

  axis.titleProperties = function(x) {
    if (!arguments.length) return titleStyle;
    if (titleStyle !== x) { titleStyle = x; }
    return axis;
  };

  axis.domainProperties = function(x) {
    if (!arguments.length) return domainStyle;
    if (domainStyle !== x) { domainStyle = x; }
    return axis;
  };

  axis.reset = function() {
    reset();
    return axis;
  };

  return axis;
}

var axisOrients = {top: 1, right: 1, bottom: 1, left: 1};

function axisSubdivide(scale, ticks, m) {
  var subticks = [];
  if (m && ticks.length > 1) {
    var extent = axisScaleExtent(scale.domain()),
        i = -1,
        n = ticks.length,
        d = (ticks[1] - ticks[0]) / ++m,
        j,
        v;
    while (++i < n) {
      for (j = m; --j > 0;) {
        if ((v = +ticks[i] - j * d) >= extent[0]) {
          subticks.push(v);
        }
      }
    }
    for (--i, j = 0; ++j < m && (v = +ticks[i] + j * d) < extent[1];) {
      subticks.push(v);
    }
  }
  return subticks;
}

function axisScaleExtent(domain) {
  var start = domain[0], stop = domain[domain.length - 1];
  return start < stop ? [start, stop] : [stop, start];
}

function axisScaleRange(scale) {
  return scale.rangeExtent ?
    scale.rangeExtent() :
    axisScaleExtent(scale.range());
}

var axisAlign = {
  bottom: 'center',
  top: 'center',
  left: 'right',
  right: 'left'
};

var axisBaseline = {
  bottom: 'top',
  top: 'bottom',
  left: 'middle',
  right: 'middle'
};

function axisLabelExtend(orient, labels, oldScale, newScale, size, pad) {
  size = Math.max(size, 0) + pad;
  if (orient === 'left' || orient === 'top') {
    size *= -1;
  }
  if (orient === 'top' || orient === 'bottom') {
    dl.extend(labels.properties.enter, {
      x: oldScale,
      y: {value: size},
    });
    dl.extend(labels.properties.update, {
      x: newScale,
      y: {value: size},
      align: {value: 'center'},
      baseline: {value: axisBaseline[orient]}
    });
  } else {
    dl.extend(labels.properties.enter, {
      x: {value: size},
      y: oldScale,
    });
    dl.extend(labels.properties.update, {
      x: {value: size},
      y: newScale,
      align: {value: axisAlign[orient]},
      baseline: {value: 'middle'}
    });
  }
}

function axisTicksExtend(orient, ticks, oldRef, newRef, size, scale, config, offset) {
  var sign = (orient === 'left' || orient === 'top') ? -1 : 1;
  if (size === Infinity) {
    size = (orient === 'top' || orient === 'bottom') ?
      {field: {group: 'height', level: 2}, mult: -sign, offset: offset*-sign} :
      {field: {group: 'width',  level: 2}, mult: -sign, offset: offset*-sign};
  } else {
    size = {value: sign * size, offset: offset};
  }

  // Update offset of tick placement to be in between ordinal marks
  // instead of directly aligned with.
  if (config.tickPlacement === 'between' && scale.type === ORDINAL) {
    var rng = scale.range(),
        tickOffset = 0.5 + (scale.rangeBand() || (rng[1] - rng[0]) / 2);
    newRef = oldRef = dl.duplicate(newRef);
    newRef.offset = oldRef.offset = tickOffset;
  }

  if (orient === 'top' || orient === 'bottom') {
    dl.extend(ticks.properties.enter, {
      x:  oldRef,
      y:  {value: 0},
      y2: size
    });
    dl.extend(ticks.properties.update, {
      x:  newRef,
      y:  {value: 0},
      y2: size
    });
    dl.extend(ticks.properties.exit, {
      x:  newRef,
    });
  } else {
    dl.extend(ticks.properties.enter, {
      x:  {value: 0},
      x2: size,
      y:  oldRef
    });
    dl.extend(ticks.properties.update, {
      x:  {value: 0},
      x2: size,
      y:  newRef
    });
    dl.extend(ticks.properties.exit, {
      y:  newRef,
    });
  }
}

function axisTitleExtend(orient, title, range, offset) {
  var update = title.properties.update,
      mid = ~~((range[0] + range[1]) / 2),
      sign = (orient === 'top' || orient === 'left') ? -1 : 1;

  if (orient === 'bottom' || orient === 'top') {
    update.x = {value: mid};
    update.angle = {value: 0};
    if (offset >= 0) update.y = {value: sign * offset};
  } else {
    update.y = {value: mid};
    update.angle = {value: orient === 'left' ? -90 : 90};
    if (offset >= 0) update.x = {value: sign * offset};
  }
}

function axisDomainExtend(orient, domain, range, size) {
  var path;
  if (orient === 'top' || orient === 'left') {
    size = -1 * size;
  }
  if (orient === 'bottom' || orient === 'top') {
    path = 'M' + range[0] + ',' + size + 'V0H' + range[1] + 'V' + size;
  } else {
    path = 'M' + size + ',' + range[0] + 'H0V' + range[1] + 'H' + size;
  }
  domain.properties.update.path = {value: path};
}

function axisUpdate(item, group, trans) {
  var o = trans ? {} : item,
      offset = item.mark.def.offset,
      orient = item.mark.def.orient,
      width  = group.width,
      height = group.height; // TODO fallback to global w,h?

  if (dl.isArray(offset)) {
    var ofx = offset[0],
        ofy = offset[1];

    switch (orient) {
      case 'left':   { Tuple.set(o, 'x', -ofx); Tuple.set(o, 'y', ofy); break; }
      case 'right':  { Tuple.set(o, 'x', width + ofx); Tuple.set(o, 'y', ofy); break; }
      case 'bottom': { Tuple.set(o, 'x', ofx); Tuple.set(o, 'y', height + ofy); break; }
      case 'top':    { Tuple.set(o, 'x', ofx); Tuple.set(o, 'y', -ofy); break; }
      default:       { Tuple.set(o, 'x', ofx); Tuple.set(o, 'y', ofy); }
    }
  } else {
    if (dl.isObject(offset)) {
      offset = -group.scale(offset.scale)(offset.value);
    }

    switch (orient) {
      case 'left':   { Tuple.set(o, 'x', -offset); Tuple.set(o, 'y', 0); break; }
      case 'right':  { Tuple.set(o, 'x', width + offset); Tuple.set(o, 'y', 0); break; }
      case 'bottom': { Tuple.set(o, 'x', 0); Tuple.set(o, 'y', height + offset); break; }
      case 'top':    { Tuple.set(o, 'x', 0); Tuple.set(o, 'y', -offset); break; }
      default:       { Tuple.set(o, 'x', 0); Tuple.set(o, 'y', 0); }
    }
  }

  if (trans) trans.interpolate(item, o);
  return true;
}

function axisTicks(config) {
  return {
    type: 'rule',
    interactive: false,
    key: 'data',
    properties: {
      enter: {
        stroke: {value: config.tickColor},
        strokeWidth: {value: config.tickWidth},
        opacity: {value: 1e-6}
      },
      exit: { opacity: {value: 1e-6} },
      update: { opacity: {value: 1} }
    }
  };
}

function axisTickLabels(config) {
  return {
    type: 'text',
    interactive: true,
    key: 'data',
    properties: {
      enter: {
        fill: {value: config.tickLabelColor},
        font: {value: config.tickLabelFont},
        fontSize: {value: config.tickLabelFontSize},
        opacity: {value: 1e-6},
        text: {field: 'label'}
      },
      exit: { opacity: {value: 1e-6} },
      update: { opacity: {value: 1} }
    }
  };
}

function axisTitle(config) {
  return {
    type: 'text',
    interactive: true,
    properties: {
      enter: {
        font: {value: config.titleFont},
        fontSize: {value: config.titleFontSize},
        fontWeight: {value: config.titleFontWeight},
        fill: {value: config.titleColor},
        align: {value: 'center'},
        baseline: {value: 'middle'},
        text: {field: 'data'}
      },
      update: {}
    }
  };
}

function axisDomain(config) {
  return {
    type: 'path',
    interactive: false,
    properties: {
      enter: {
        x: {value: 0.5},
        y: {value: 0.5},
        stroke: {value: config.axisColor},
        strokeWidth: {value: config.axisWidth}
      },
      update: {}
    }
  };
}

module.exports = axs;


/***/ }),

/***/ "lTFi":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/"),
    parse = __webpack_require__("eJnU"),
    render = __webpack_require__("bSC/"),
    areaPath = __webpack_require__("zhsD").path.area;

function path(g, items) {
  var o = items[0],
      p = o.pathCache || (o.pathCache = parse(areaPath(items)));
  render(g, p);
}

function pick(g, scene, x, y, gx, gy) {
  var items = scene.items,
      b = scene.bounds;

  if (!items || !items.length || b && !b.contains(gx, gy)) {
    return null;
  }

  if (g.pixelratio != null && g.pixelratio !== 1) {
    x *= g.pixelratio;
    y *= g.pixelratio;
  }
  return hit(g, items, x, y) ? items[0] : null;
}

var hit = util.testPath(path);

module.exports = {
  draw: util.drawOne(path),
  pick: pick,
  nested: true
};


/***/ }),

/***/ "lkhv":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");
var Aggregator = __webpack_require__("tGq9");

module.exports = function() {
  // flatten arguments into a single array
  var args = [].reduce.call(arguments, function(a, x) {
    return a.concat(util.array(x));
  }, []);
  // create and return an aggregator
  return new Aggregator()
    .groupby(args)
    .summarize({'*':'values'});
};


/***/ }),

/***/ "lnKO":
/***/ (function(module, exports) {

function Bounds(b) {
  this.clear();
  if (b) this.union(b);
}

var prototype = Bounds.prototype;

prototype.clone = function() {
  return new Bounds(this);
};

prototype.clear = function() {
  this.x1 = +Number.MAX_VALUE;
  this.y1 = +Number.MAX_VALUE;
  this.x2 = -Number.MAX_VALUE;
  this.y2 = -Number.MAX_VALUE;
  return this;
};

prototype.set = function(x1, y1, x2, y2) {
  this.x1 = x1;
  this.y1 = y1;
  this.x2 = x2;
  this.y2 = y2;
  return this;
};

prototype.add = function(x, y) {
  if (x < this.x1) this.x1 = x;
  if (y < this.y1) this.y1 = y;
  if (x > this.x2) this.x2 = x;
  if (y > this.y2) this.y2 = y;
  return this;
};

prototype.expand = function(d) {
  this.x1 -= d;
  this.y1 -= d;
  this.x2 += d;
  this.y2 += d;
  return this;
};

prototype.round = function() {
  this.x1 = Math.floor(this.x1);
  this.y1 = Math.floor(this.y1);
  this.x2 = Math.ceil(this.x2);
  this.y2 = Math.ceil(this.y2);
  return this;
};

prototype.translate = function(dx, dy) {
  this.x1 += dx;
  this.x2 += dx;
  this.y1 += dy;
  this.y2 += dy;
  return this;
};

prototype.rotate = function(angle, x, y) {
  var cos = Math.cos(angle),
      sin = Math.sin(angle),
      cx = x - x*cos + y*sin,
      cy = y - x*sin - y*cos,
      x1 = this.x1, x2 = this.x2,
      y1 = this.y1, y2 = this.y2;

  return this.clear()
    .add(cos*x1 - sin*y1 + cx,  sin*x1 + cos*y1 + cy)
    .add(cos*x1 - sin*y2 + cx,  sin*x1 + cos*y2 + cy)
    .add(cos*x2 - sin*y1 + cx,  sin*x2 + cos*y1 + cy)
    .add(cos*x2 - sin*y2 + cx,  sin*x2 + cos*y2 + cy);
};

prototype.union = function(b) {
  if (b.x1 < this.x1) this.x1 = b.x1;
  if (b.y1 < this.y1) this.y1 = b.y1;
  if (b.x2 > this.x2) this.x2 = b.x2;
  if (b.y2 > this.y2) this.y2 = b.y2;
  return this;
};

prototype.encloses = function(b) {
  return b && (
    this.x1 <= b.x1 &&
    this.x2 >= b.x2 &&
    this.y1 <= b.y1 &&
    this.y2 >= b.y2
  );
};

prototype.alignsWith = function(b) {
  return b && (
    this.x1 == b.x1 ||
    this.x2 == b.x2 ||
    this.y1 == b.y1 ||
    this.y2 == b.y2
  );
};

prototype.intersects = function(b) {
  return b && !(
    this.x2 < b.x1 ||
    this.x1 > b.x2 ||
    this.y2 < b.y1 ||
    this.y1 > b.y2
  );
};

prototype.contains = function(x, y) {
  return !(
    x < this.x1 ||
    x > this.x2 ||
    y < this.y1 ||
    y > this.y2
  );
};

prototype.width = function() {
  return this.x2 - this.x1;
};

prototype.height = function() {
  return this.y2 - this.y1;
};

module.exports = Bounds;


/***/ }),

/***/ "mP8n":
/***/ (function(module, exports, __webpack_require__) {

var ImageLoader = __webpack_require__("zLl/"),
    Renderer = __webpack_require__("ZyfV"),
    text = __webpack_require__("3Scv"),
    DOM = __webpack_require__("sV93"),
    SVG = __webpack_require__("zhsD"),
    ns = SVG.metadata.xmlns,
    marks = __webpack_require__("rfWk");

function SVGRenderer(loadConfig) {
  Renderer.call(this);
  this._loader = new ImageLoader(loadConfig);
  this._dirtyID = 0;
}

var base = Renderer.prototype;
var prototype = (SVGRenderer.prototype = Object.create(base));
prototype.constructor = SVGRenderer;

prototype.initialize = function(el, width, height, padding) {
  if (el) {
    this._svg = DOM.child(el, 0, 'svg', ns, 'marks');
    DOM.clear(el, 1);
    // set the svg root group
    this._root = DOM.child(this._svg, 0, 'g', ns);
    DOM.clear(this._svg, 1);
  }

  // create the svg definitions cache
  this._defs = {
    clip_id:  1,
    gradient: {},
    clipping: {}
  };

  // set background color if defined
  this.background(this._bgcolor);

  return base.initialize.call(this, el, width, height, padding);
};

prototype.background = function(bgcolor) {
  if (arguments.length && this._svg) {
    this._svg.style.setProperty('background-color', bgcolor);
  }
  return base.background.apply(this, arguments);
};

prototype.resize = function(width, height, padding) {
  base.resize.call(this, width, height, padding);
  
  if (this._svg) {
    var w = this._width,
        h = this._height,
        p = this._padding;
  
    this._svg.setAttribute('width', w + p.left + p.right);
    this._svg.setAttribute('height', h + p.top + p.bottom);
    
    this._root.setAttribute('transform', 'translate('+p.left+','+p.top+')');
  }

  return this;
};

prototype.svg = function() {
  if (!this._svg) return null;

  var attr = {
    'class':  'marks',
    'width':  this._width + this._padding.left + this._padding.right,
    'height': this._height + this._padding.top + this._padding.bottom,
  };
  for (var key in SVG.metadata) {
    attr[key] = SVG.metadata[key];
  }

  return DOM.openTag('svg', attr) + this._svg.innerHTML + DOM.closeTag('svg');
};

prototype.imageURL = function(url) {
  return this._loader.imageURL(url);
};


// -- Render entry point --

prototype.render = function(scene, items) {
  if (this._dirtyCheck(items)) {
    if (this._dirtyAll) this._resetDefs();
    this.draw(this._root, scene, -1);
    DOM.clear(this._root, 1);
  }
  this.updateDefs();
  return this;
};

prototype.draw = function(el, scene, index) {
  this.drawMark(el, scene, index, marks[scene.marktype]);
};


// -- Manage SVG definitions ('defs') block --

prototype.updateDefs = function() {
  var svg = this._svg,
      defs = this._defs,
      el = defs.el,
      index = 0, id;

  for (id in defs.gradient) {
    if (!el) el = (defs.el = DOM.child(svg, 0, 'defs', ns));
    updateGradient(el, defs.gradient[id], index++);
  }

  for (id in defs.clipping) {
    if (!el) el = (defs.el = DOM.child(svg, 0, 'defs', ns));
    updateClipping(el, defs.clipping[id], index++);
  }

  // clean-up
  if (el) {
    if (index === 0) {
      svg.removeChild(el);
      defs.el = null;
    } else {
      DOM.clear(el, index);      
    }
  }
};

function updateGradient(el, grad, index) {
  var i, n, stop;

  el = DOM.child(el, index, 'linearGradient', ns);
  el.setAttribute('id', grad.id);
  el.setAttribute('x1', grad.x1);
  el.setAttribute('x2', grad.x2);
  el.setAttribute('y1', grad.y1);
  el.setAttribute('y2', grad.y2);
  
  for (i=0, n=grad.stops.length; i<n; ++i) {
    stop = DOM.child(el, i, 'stop', ns);
    stop.setAttribute('offset', grad.stops[i].offset);
    stop.setAttribute('stop-color', grad.stops[i].color);
  }
  DOM.clear(el, i);
}

function updateClipping(el, clip, index) {
  var rect;

  el = DOM.child(el, index, 'clipPath', ns);
  el.setAttribute('id', clip.id);
  rect = DOM.child(el, 0, 'rect', ns);
  rect.setAttribute('x', 0);
  rect.setAttribute('y', 0);
  rect.setAttribute('width', clip.width);
  rect.setAttribute('height', clip.height);
}

prototype._resetDefs = function() {
  var def = this._defs;
  def.clip_id = 1;
  def.gradient = {};
  def.clipping = {};
};


// -- Manage rendering of items marked as dirty --

prototype.isDirty = function(item) {
  return this._dirtyAll || item.dirty === this._dirtyID;
};

prototype._dirtyCheck = function(items) {
  this._dirtyAll = true;
  if (!items) return true;

  var id = ++this._dirtyID,
      item, mark, type, mdef, i, n, o;

  for (i=0, n=items.length; i<n; ++i) {
    item = items[i];
    mark = item.mark;
    if (mark.marktype !== type) {
      // memoize mark instance lookup
      type = mark.marktype;
      mdef = marks[type];
    }

    if (item.status === 'exit') { // EXIT
      if (item._svg) {
        if (mdef.nest && item.mark.items.length) {
          // if nested mark with remaining points, update instead
          this._update(mdef, item._svg, item.mark.items[0]);
          o = item.mark.items[0];
          o._svg = item._svg;
          o._update = id;
        } else {
          // otherwise remove from DOM
          DOM.remove(item._svg);
        }
        item._svg = null;
      }
      continue;
    }

    item = (mdef.nest ? mark.items[0] : item);
    if (item._update === id) { // Already processed
      continue;
    } else if (item._svg) { // UPDATE
      this._update(mdef, item._svg, item);
    } else { // ENTER
      this._dirtyAll = false;
      dirtyParents(item, id);
    }
    item._update = id;
  }
  return !this._dirtyAll;
};

function dirtyParents(item, id) {
  for (; item && item.dirty !== id; item=item.mark.group) {
    item.dirty = id;
    if (item.mark && item.mark.dirty !== id) {
      item.mark.dirty = id;
    } else return;
  }
}


// -- Construct & maintain scenegraph to SVG mapping ---

// Draw a mark container.
prototype.drawMark = function(el, scene, index, mdef) {
  if (!this.isDirty(scene)) return;

  var items = mdef.nest ?
        (scene.items && scene.items.length ? [scene.items[0]] : []) :
        scene.items || [],
      events = scene.interactive === false ? 'none' : null,
      isGroup = (mdef.tag === 'g'),
      className = DOM.cssClass(scene),
      p, i, n, c, d, insert;

  p = DOM.child(el, index+1, 'g', ns, className);
  p.setAttribute('class', className);
  scene._svg = p;
  if (!isGroup && events) {
    p.style.setProperty('pointer-events', events);
  }

  for (i=0, n=items.length; i<n; ++i) {
    if (this.isDirty(d = items[i])) {
      insert = !(this._dirtyAll || d._svg);
      c = bind(p, mdef, d, i, insert);
      this._update(mdef, c, d);
      if (isGroup) {
        if (insert) this._dirtyAll = true;
        this._recurse(c, d);
        if (insert) this._dirtyAll = false;
      }
    }
  }
  DOM.clear(p, i);
  return p;
};

// Recursively process group contents.
prototype._recurse = function(el, group) {
  var items = group.items || [],
      legends = group.legendItems || [],
      axes = group.axisItems || [],
      idx = 0, j, m;

  for (j=0, m=axes.length; j<m; ++j) {
    if (axes[j].layer === 'back') {
      this.drawMark(el, axes[j], idx++, marks.group);
    }
  }
  for (j=0, m=items.length; j<m; ++j) {
    this.draw(el, items[j], idx++);
  }
  for (j=0, m=axes.length; j<m; ++j) {
    if (axes[j].layer !== 'back') {
      this.drawMark(el, axes[j], idx++, marks.group);
    }
  }
  for (j=0, m=legends.length; j<m; ++j) {
    this.drawMark(el, legends[j], idx++, marks.group);
  }

  // remove any extraneous DOM elements
  DOM.clear(el, 1 + idx);
};

// Bind a scenegraph item to an SVG DOM element.
// Create new SVG elements as needed.
function bind(el, mdef, item, index, insert) {
  // create svg element, bind item data for D3 compatibility
  var node = DOM.child(el, index, mdef.tag, ns, null, insert);
  node.__data__ = item;
  node.__values__ = {fill: 'default'};

  // create background rect
  if (mdef.tag === 'g') {
    var bg = DOM.child(node, 0, 'rect', ns, 'background');
    bg.__data__ = item;
  }

  // add pointer from scenegraph item to svg element
  return (item._svg = node);
}


// -- Set attributes & styles on SVG elements ---

var element = null, // temp var for current SVG element
    values = null;  // temp var for current values hash

// Extra configuration for certain mark types
var mark_extras = {
  group: function(mdef, el, item) {
    element = el.childNodes[0];
    values = el.__values__; // use parent's values hash
    mdef.background(emit, item, this);

    var value = item.mark.interactive === false ? 'none' : null;
    if (value !== values.events) {
      element.style.setProperty('pointer-events', value);
      values.events = value;
    }
  },
  text: function(mdef, el, item) {
    var str = text.value(item.text);
    if (str !== values.text) {
      el.textContent = str;
      values.text = str;
    }
    str = text.font(item);
    if (str !== values.font) {
      el.style.setProperty('font', str);
      values.font = str;
    }
  }
};

prototype._update = function(mdef, el, item) {
  // set dom element and values cache
  // provides access to emit method
  element = el;
  values = el.__values__;

  // apply svg attributes
  mdef.attr(emit, item, this);

  // some marks need special treatment
  var extra = mark_extras[mdef.type];
  if (extra) extra(mdef, el, item);

  // apply svg css styles
  // note: element may be modified by 'extra' method
  this.style(element, item);
};

function emit(name, value, ns) {
  // early exit if value is unchanged
  if (value === values[name]) return;

  if (value != null) {
    // if value is provided, update DOM attribute
    if (ns) {
      element.setAttributeNS(ns, name, value);
    } else {
      element.setAttribute(name, value);
    }
  } else {
    // else remove DOM attribute
    if (ns) {
      element.removeAttributeNS(ns, name);
    } else {
      element.removeAttribute(name);
    }
  }

  // note current value for future comparison
  values[name] = value;
}

prototype.style = function(el, o) {
  if (o == null) return;
  var i, n, prop, name, value;

  for (i=0, n=SVG.styleProperties.length; i<n; ++i) {
    prop = SVG.styleProperties[i];
    value = o[prop];
    if (value === values[prop]) continue;

    name = SVG.styles[prop];
    if (value == null) {
      if (name === 'fill') {
        el.style.setProperty(name, 'none');
      } else {
        el.style.removeProperty(name);
      }
    } else {
      if (value.id) {
        // ensure definition is included
        this._defs.gradient[value.id] = value;
        value = 'url(' + href() + '#' + value.id + ')';
      }
      el.style.setProperty(name, value+'');
    }

    values[prop] = value;
  }
};

function href() {
  return typeof window !== 'undefined' ? window.location.href : '';
}

module.exports = SVGRenderer;


/***/ }),

/***/ "mgrV":
/***/ (function(module, exports, __webpack_require__) {

var d3_time = __webpack_require__("aZ75");

var tempDate = new Date(),
    baseDate = new Date(0, 0, 1).setFullYear(0), // Jan 1, 0 AD
    utcBaseDate = new Date(Date.UTC(0, 0, 1)).setUTCFullYear(0);

function date(d) {
  return (tempDate.setTime(+d), tempDate);
}

// create a time unit entry
function entry(type, date, unit, step, min, max) {
  var e = {
    type: type,
    date: date,
    unit: unit
  };
  if (step) {
    e.step = step;
  } else {
    e.minstep = 1;
  }
  if (min != null) e.min = min;
  if (max != null) e.max = max;
  return e;
}

function create(type, unit, base, step, min, max) {
  return entry(type,
    function(d) { return unit.offset(base, d); },
    function(d) { return unit.count(base, d); },
    step, min, max);
}

var locale = [
  create('second', d3_time.second, baseDate),
  create('minute', d3_time.minute, baseDate),
  create('hour',   d3_time.hour,   baseDate),
  create('day',    d3_time.day,    baseDate, [1, 7]),
  create('month',  d3_time.month,  baseDate, [1, 3, 6]),
  create('year',   d3_time.year,   baseDate),

  // periodic units
  entry('seconds',
    function(d) { return new Date(1970, 0, 1, 0, 0, d); },
    function(d) { return date(d).getSeconds(); },
    null, 0, 59
  ),
  entry('minutes',
    function(d) { return new Date(1970, 0, 1, 0, d); },
    function(d) { return date(d).getMinutes(); },
    null, 0, 59
  ),
  entry('hours',
    function(d) { return new Date(1970, 0, 1, d); },
    function(d) { return date(d).getHours(); },
    null, 0, 23
  ),
  entry('weekdays',
    function(d) { return new Date(1970, 0, 4+d); },
    function(d) { return date(d).getDay(); },
    [1], 0, 6
  ),
  entry('dates',
    function(d) { return new Date(1970, 0, d); },
    function(d) { return date(d).getDate(); },
    [1], 1, 31
  ),
  entry('months',
    function(d) { return new Date(1970, d % 12, 1); },
    function(d) { return date(d).getMonth(); },
    [1], 0, 11
  )
];

var utc = [
  create('second', d3_time.utcSecond, utcBaseDate),
  create('minute', d3_time.utcMinute, utcBaseDate),
  create('hour',   d3_time.utcHour,   utcBaseDate),
  create('day',    d3_time.utcDay,    utcBaseDate, [1, 7]),
  create('month',  d3_time.utcMonth,  utcBaseDate, [1, 3, 6]),
  create('year',   d3_time.utcYear,   utcBaseDate),

  // periodic units
  entry('seconds',
    function(d) { return new Date(Date.UTC(1970, 0, 1, 0, 0, d)); },
    function(d) { return date(d).getUTCSeconds(); },
    null, 0, 59
  ),
  entry('minutes',
    function(d) { return new Date(Date.UTC(1970, 0, 1, 0, d)); },
    function(d) { return date(d).getUTCMinutes(); },
    null, 0, 59
  ),
  entry('hours',
    function(d) { return new Date(Date.UTC(1970, 0, 1, d)); },
    function(d) { return date(d).getUTCHours(); },
    null, 0, 23
  ),
  entry('weekdays',
    function(d) { return new Date(Date.UTC(1970, 0, 4+d)); },
    function(d) { return date(d).getUTCDay(); },
    [1], 0, 6
  ),
  entry('dates',
    function(d) { return new Date(Date.UTC(1970, 0, d)); },
    function(d) { return date(d).getUTCDate(); },
    [1], 1, 31
  ),
  entry('months',
    function(d) { return new Date(Date.UTC(1970, d % 12, 1)); },
    function(d) { return date(d).getUTCMonth(); },
    [1], 0, 11
  )
];

var STEPS = [
  [31536e6, 5],  // 1-year
  [7776e6, 4],   // 3-month
  [2592e6, 4],   // 1-month
  [12096e5, 3],  // 2-week
  [6048e5, 3],   // 1-week
  [1728e5, 3],   // 2-day
  [864e5, 3],    // 1-day
  [432e5, 2],    // 12-hour
  [216e5, 2],    // 6-hour
  [108e5, 2],    // 3-hour
  [36e5, 2],     // 1-hour
  [18e5, 1],     // 30-minute
  [9e5, 1],      // 15-minute
  [3e5, 1],      // 5-minute
  [6e4, 1],      // 1-minute
  [3e4, 0],      // 30-second
  [15e3, 0],     // 15-second
  [5e3, 0],      // 5-second
  [1e3, 0]       // 1-second
];

function find(units, span, minb, maxb) {
  var step = STEPS[0], i, n, bins;

  for (i=1, n=STEPS.length; i<n; ++i) {
    step = STEPS[i];
    if (span > step[0]) {
      bins = span / step[0];
      if (bins > maxb) {
        return units[STEPS[i-1][1]];
      }
      if (bins >= minb) {
        return units[step[1]];
      }
    }
  }
  return units[STEPS[n-1][1]];
}

function toUnitMap(units) {
  var map = {}, i, n;
  for (i=0, n=units.length; i<n; ++i) {
    map[units[i].type] = units[i];
  }
  map.find = function(span, minb, maxb) {
    return find(units, span, minb, maxb);
  };
  return map;
}

module.exports = toUnitMap(locale);
module.exports.utc = toUnitMap(utc);

/***/ }),

/***/ "nIY2":
/***/ (function(module, exports, __webpack_require__) {

var dsv = __webpack_require__("pYy3");

module.exports = {
  json: __webpack_require__("cwb4"),
  topojson: __webpack_require__("Z8XL"),
  treejson: __webpack_require__("jbgm"),
  dsv: dsv,
  csv: dsv.delimiter(','),
  tsv: dsv.delimiter('\t')
};


/***/ }),

/***/ "nOes":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var bin_1 = __webpack_require__("FmT5");
var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var util_1 = __webpack_require__("ZAUf");
var bin;
(function (bin_2) {
    function parse(model) {
        return model.reduce(function (binComponent, fieldDef, channel) {
            var bin = model.fieldDef(channel).bin;
            if (bin) {
                var binTrans = util_1.extend({
                    type: 'bin',
                    field: fieldDef.field,
                    output: {
                        start: fielddef_1.field(fieldDef, { binSuffix: '_start' }),
                        mid: fielddef_1.field(fieldDef, { binSuffix: '_mid' }),
                        end: fielddef_1.field(fieldDef, { binSuffix: '_end' })
                    }
                }, typeof bin === 'boolean' ? {} : bin);
                if (!binTrans.maxbins && !binTrans.step) {
                    binTrans.maxbins = bin_1.autoMaxBins(channel);
                }
                var transform = [binTrans];
                var isOrdinalColor = model.isOrdinalScale(channel) || channel === channel_1.COLOR;
                if (isOrdinalColor) {
                    transform.push({
                        type: 'formula',
                        field: fielddef_1.field(fieldDef, { binSuffix: '_range' }),
                        expr: fielddef_1.field(fieldDef, { datum: true, binSuffix: '_start' }) +
                            ' + \'-\' + ' +
                            fielddef_1.field(fieldDef, { datum: true, binSuffix: '_end' })
                    });
                }
                var key = util_1.hash(bin) + '_' + fieldDef.field + 'oc:' + isOrdinalColor;
                binComponent[key] = transform;
            }
            return binComponent;
        }, {});
    }
    bin_2.parseUnit = parse;
    function parseFacet(model) {
        var binComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            util_1.extend(binComponent, childDataComponent.bin);
            delete childDataComponent.bin;
        }
        return binComponent;
    }
    bin_2.parseFacet = parseFacet;
    function parseLayer(model) {
        var binComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (!childDataComponent.source) {
                util_1.extend(binComponent, childDataComponent.bin);
                delete childDataComponent.bin;
            }
        });
        return binComponent;
    }
    bin_2.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.flatten(util_1.vals(component.bin));
    }
    bin_2.assemble = assemble;
})(bin = exports.bin || (exports.bin = {}));
//# sourceMappingURL=bin.js.map

/***/ }),

/***/ "nTOs":
/***/ (function(module, exports, __webpack_require__) {

(function (global, factory) {
   true ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.topojson = global.topojson || {})));
}(this, (function (exports) { 'use strict';

function noop() {}

function transformAbsolute(transform) {
  if (!transform) return noop;
  var x0,
      y0,
      kx = transform.scale[0],
      ky = transform.scale[1],
      dx = transform.translate[0],
      dy = transform.translate[1];
  return function(point, i) {
    if (!i) x0 = y0 = 0;
    point[0] = (x0 += point[0]) * kx + dx;
    point[1] = (y0 += point[1]) * ky + dy;
  };
}

function transformRelative(transform) {
  if (!transform) return noop;
  var x0,
      y0,
      kx = transform.scale[0],
      ky = transform.scale[1],
      dx = transform.translate[0],
      dy = transform.translate[1];
  return function(point, i) {
    if (!i) x0 = y0 = 0;
    var x1 = Math.round((point[0] - dx) / kx),
        y1 = Math.round((point[1] - dy) / ky);
    point[0] = x1 - x0;
    point[1] = y1 - y0;
    x0 = x1;
    y0 = y1;
  };
}

function reverse(array, n) {
  var t, j = array.length, i = j - n;
  while (i < --j) t = array[i], array[i++] = array[j], array[j] = t;
}

function bisect(a, x) {
  var lo = 0, hi = a.length;
  while (lo < hi) {
    var mid = lo + hi >>> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function feature(topology, o) {
  return o.type === "GeometryCollection" ? {
    type: "FeatureCollection",
    features: o.geometries.map(function(o) { return feature$1(topology, o); })
  } : feature$1(topology, o);
}

function feature$1(topology, o) {
  var f = {
    type: "Feature",
    id: o.id,
    properties: o.properties || {},
    geometry: object(topology, o)
  };
  if (o.id == null) delete f.id;
  return f;
}

function object(topology, o) {
  var absolute = transformAbsolute(topology.transform),
      arcs = topology.arcs;

  function arc(i, points) {
    if (points.length) points.pop();
    for (var a = arcs[i < 0 ? ~i : i], k = 0, n = a.length, p; k < n; ++k) {
      points.push(p = a[k].slice());
      absolute(p, k);
    }
    if (i < 0) reverse(points, n);
  }

  function point(p) {
    p = p.slice();
    absolute(p, 0);
    return p;
  }

  function line(arcs) {
    var points = [];
    for (var i = 0, n = arcs.length; i < n; ++i) arc(arcs[i], points);
    if (points.length < 2) points.push(points[0].slice());
    return points;
  }

  function ring(arcs) {
    var points = line(arcs);
    while (points.length < 4) points.push(points[0].slice());
    return points;
  }

  function polygon(arcs) {
    return arcs.map(ring);
  }

  function geometry(o) {
    var t = o.type;
    return t === "GeometryCollection" ? {type: t, geometries: o.geometries.map(geometry)}
        : t in geometryType ? {type: t, coordinates: geometryType[t](o)}
        : null;
  }

  var geometryType = {
    Point: function(o) { return point(o.coordinates); },
    MultiPoint: function(o) { return o.coordinates.map(point); },
    LineString: function(o) { return line(o.arcs); },
    MultiLineString: function(o) { return o.arcs.map(line); },
    Polygon: function(o) { return polygon(o.arcs); },
    MultiPolygon: function(o) { return o.arcs.map(polygon); }
  };

  return geometry(o);
}

function stitchArcs(topology, arcs) {
  var stitchedArcs = {},
      fragmentByStart = {},
      fragmentByEnd = {},
      fragments = [],
      emptyIndex = -1;

  // Stitch empty arcs first, since they may be subsumed by other arcs.
  arcs.forEach(function(i, j) {
    var arc = topology.arcs[i < 0 ? ~i : i], t;
    if (arc.length < 3 && !arc[1][0] && !arc[1][1]) {
      t = arcs[++emptyIndex], arcs[emptyIndex] = i, arcs[j] = t;
    }
  });

  arcs.forEach(function(i) {
    var e = ends(i),
        start = e[0],
        end = e[1],
        f, g;

    if (f = fragmentByEnd[start]) {
      delete fragmentByEnd[f.end];
      f.push(i);
      f.end = end;
      if (g = fragmentByStart[end]) {
        delete fragmentByStart[g.start];
        var fg = g === f ? f : f.concat(g);
        fragmentByStart[fg.start = f.start] = fragmentByEnd[fg.end = g.end] = fg;
      } else {
        fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
      }
    } else if (f = fragmentByStart[end]) {
      delete fragmentByStart[f.start];
      f.unshift(i);
      f.start = start;
      if (g = fragmentByEnd[start]) {
        delete fragmentByEnd[g.end];
        var gf = g === f ? f : g.concat(f);
        fragmentByStart[gf.start = g.start] = fragmentByEnd[gf.end = f.end] = gf;
      } else {
        fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
      }
    } else {
      f = [i];
      fragmentByStart[f.start = start] = fragmentByEnd[f.end = end] = f;
    }
  });

  function ends(i) {
    var arc = topology.arcs[i < 0 ? ~i : i], p0 = arc[0], p1;
    if (topology.transform) p1 = [0, 0], arc.forEach(function(dp) { p1[0] += dp[0], p1[1] += dp[1]; });
    else p1 = arc[arc.length - 1];
    return i < 0 ? [p1, p0] : [p0, p1];
  }

  function flush(fragmentByEnd, fragmentByStart) {
    for (var k in fragmentByEnd) {
      var f = fragmentByEnd[k];
      delete fragmentByStart[f.start];
      delete f.start;
      delete f.end;
      f.forEach(function(i) { stitchedArcs[i < 0 ? ~i : i] = 1; });
      fragments.push(f);
    }
  }

  flush(fragmentByEnd, fragmentByStart);
  flush(fragmentByStart, fragmentByEnd);
  arcs.forEach(function(i) { if (!stitchedArcs[i < 0 ? ~i : i]) fragments.push([i]); });

  return fragments;
}

function mesh(topology) {
  return object(topology, meshArcs.apply(this, arguments));
}

function meshArcs(topology, o, filter) {
  var arcs = [];

  function arc(i) {
    var j = i < 0 ? ~i : i;
    (geomsByArc[j] || (geomsByArc[j] = [])).push({i: i, g: geom});
  }

  function line(arcs) {
    arcs.forEach(arc);
  }

  function polygon(arcs) {
    arcs.forEach(line);
  }

  function geometry(o) {
    if (o.type === "GeometryCollection") o.geometries.forEach(geometry);
    else if (o.type in geometryType) geom = o, geometryType[o.type](o.arcs);
  }

  if (arguments.length > 1) {
    var geomsByArc = [],
        geom;

    var geometryType = {
      LineString: line,
      MultiLineString: polygon,
      Polygon: polygon,
      MultiPolygon: function(arcs) { arcs.forEach(polygon); }
    };

    geometry(o);

    geomsByArc.forEach(arguments.length < 3
        ? function(geoms) { arcs.push(geoms[0].i); }
        : function(geoms) { if (filter(geoms[0].g, geoms[geoms.length - 1].g)) arcs.push(geoms[0].i); });
  } else {
    for (var i = 0, n = topology.arcs.length; i < n; ++i) arcs.push(i);
  }

  return {type: "MultiLineString", arcs: stitchArcs(topology, arcs)};
}

function cartesianTriangleArea(triangle) {
  var a = triangle[0], b = triangle[1], c = triangle[2];
  return Math.abs((a[0] - c[0]) * (b[1] - a[1]) - (a[0] - b[0]) * (c[1] - a[1]));
}

function ring(ring) {
  var i = -1,
      n = ring.length,
      a,
      b = ring[n - 1],
      area = 0;

  while (++i < n) {
    a = b;
    b = ring[i];
    area += a[0] * b[1] - a[1] * b[0];
  }

  return area / 2;
}

function merge(topology) {
  return object(topology, mergeArcs.apply(this, arguments));
}

function mergeArcs(topology, objects) {
  var polygonsByArc = {},
      polygons = [],
      components = [];

  objects.forEach(function(o) {
    if (o.type === "Polygon") register(o.arcs);
    else if (o.type === "MultiPolygon") o.arcs.forEach(register);
  });

  function register(polygon) {
    polygon.forEach(function(ring$$) {
      ring$$.forEach(function(arc) {
        (polygonsByArc[arc = arc < 0 ? ~arc : arc] || (polygonsByArc[arc] = [])).push(polygon);
      });
    });
    polygons.push(polygon);
  }

  function area(ring$$) {
    return Math.abs(ring(object(topology, {type: "Polygon", arcs: [ring$$]}).coordinates[0]));
  }

  polygons.forEach(function(polygon) {
    if (!polygon._) {
      var component = [],
          neighbors = [polygon];
      polygon._ = 1;
      components.push(component);
      while (polygon = neighbors.pop()) {
        component.push(polygon);
        polygon.forEach(function(ring$$) {
          ring$$.forEach(function(arc) {
            polygonsByArc[arc < 0 ? ~arc : arc].forEach(function(polygon) {
              if (!polygon._) {
                polygon._ = 1;
                neighbors.push(polygon);
              }
            });
          });
        });
      }
    }
  });

  polygons.forEach(function(polygon) {
    delete polygon._;
  });

  return {
    type: "MultiPolygon",
    arcs: components.map(function(polygons) {
      var arcs = [], n;

      // Extract the exterior (unique) arcs.
      polygons.forEach(function(polygon) {
        polygon.forEach(function(ring$$) {
          ring$$.forEach(function(arc) {
            if (polygonsByArc[arc < 0 ? ~arc : arc].length < 2) {
              arcs.push(arc);
            }
          });
        });
      });

      // Stitch the arcs into one or more rings.
      arcs = stitchArcs(topology, arcs);

      // If more than one ring is returned,
      // at most one of these rings can be the exterior;
      // choose the one with the greatest absolute area.
      if ((n = arcs.length) > 1) {
        for (var i = 1, k = area(arcs[0]), ki, t; i < n; ++i) {
          if ((ki = area(arcs[i])) > k) {
            t = arcs[0], arcs[0] = arcs[i], arcs[i] = t, k = ki;
          }
        }
      }

      return arcs;
    })
  };
}

function neighbors(objects) {
  var indexesByArc = {}, // arc index -> array of object indexes
      neighbors = objects.map(function() { return []; });

  function line(arcs, i) {
    arcs.forEach(function(a) {
      if (a < 0) a = ~a;
      var o = indexesByArc[a];
      if (o) o.push(i);
      else indexesByArc[a] = [i];
    });
  }

  function polygon(arcs, i) {
    arcs.forEach(function(arc) { line(arc, i); });
  }

  function geometry(o, i) {
    if (o.type === "GeometryCollection") o.geometries.forEach(function(o) { geometry(o, i); });
    else if (o.type in geometryType) geometryType[o.type](o.arcs, i);
  }

  var geometryType = {
    LineString: line,
    MultiLineString: polygon,
    Polygon: polygon,
    MultiPolygon: function(arcs, i) { arcs.forEach(function(arc) { polygon(arc, i); }); }
  };

  objects.forEach(geometry);

  for (var i in indexesByArc) {
    for (var indexes = indexesByArc[i], m = indexes.length, j = 0; j < m; ++j) {
      for (var k = j + 1; k < m; ++k) {
        var ij = indexes[j], ik = indexes[k], n;
        if ((n = neighbors[ij])[i = bisect(n, ik)] !== ik) n.splice(i, 0, ik);
        if ((n = neighbors[ik])[i = bisect(n, ij)] !== ij) n.splice(i, 0, ij);
      }
    }
  }

  return neighbors;
}

function compareArea(a, b) {
  return a[1][2] - b[1][2];
}

function minAreaHeap() {
  var heap = {},
      array = [],
      size = 0;

  heap.push = function(object) {
    up(array[object._ = size] = object, size++);
    return size;
  };

  heap.pop = function() {
    if (size <= 0) return;
    var removed = array[0], object;
    if (--size > 0) object = array[size], down(array[object._ = 0] = object, 0);
    return removed;
  };

  heap.remove = function(removed) {
    var i = removed._, object;
    if (array[i] !== removed) return; // invalid request
    if (i !== --size) object = array[size], (compareArea(object, removed) < 0 ? up : down)(array[object._ = i] = object, i);
    return i;
  };

  function up(object, i) {
    while (i > 0) {
      var j = ((i + 1) >> 1) - 1,
          parent = array[j];
      if (compareArea(object, parent) >= 0) break;
      array[parent._ = i] = parent;
      array[object._ = i = j] = object;
    }
  }

  function down(object, i) {
    while (true) {
      var r = (i + 1) << 1,
          l = r - 1,
          j = i,
          child = array[j];
      if (l < size && compareArea(array[l], child) < 0) child = array[j = l];
      if (r < size && compareArea(array[r], child) < 0) child = array[j = r];
      if (j === i) break;
      array[child._ = i] = child;
      array[object._ = i = j] = object;
    }
  }

  return heap;
}

function presimplify(topology, triangleArea) {
  var absolute = transformAbsolute(topology.transform),
      relative = transformRelative(topology.transform),
      heap = minAreaHeap();

  if (!triangleArea) triangleArea = cartesianTriangleArea;

  topology.arcs.forEach(function(arc) {
    var triangles = [],
        maxArea = 0,
        triangle,
        i,
        n,
        p;

    // To store each point’s effective area, we create a new array rather than
    // extending the passed-in point to workaround a Chrome/V8 bug (getting
    // stuck in smi mode). For midpoints, the initial effective area of
    // Infinity will be computed in the next step.
    for (i = 0, n = arc.length; i < n; ++i) {
      p = arc[i];
      absolute(arc[i] = [p[0], p[1], Infinity], i);
    }

    for (i = 1, n = arc.length - 1; i < n; ++i) {
      triangle = arc.slice(i - 1, i + 2);
      triangle[1][2] = triangleArea(triangle);
      triangles.push(triangle);
      heap.push(triangle);
    }

    for (i = 0, n = triangles.length; i < n; ++i) {
      triangle = triangles[i];
      triangle.previous = triangles[i - 1];
      triangle.next = triangles[i + 1];
    }

    while (triangle = heap.pop()) {
      var previous = triangle.previous,
          next = triangle.next;

      // If the area of the current point is less than that of the previous point
      // to be eliminated, use the latter's area instead. This ensures that the
      // current point cannot be eliminated without eliminating previously-
      // eliminated points.
      if (triangle[1][2] < maxArea) triangle[1][2] = maxArea;
      else maxArea = triangle[1][2];

      if (previous) {
        previous.next = next;
        previous[2] = triangle[2];
        update(previous);
      }

      if (next) {
        next.previous = previous;
        next[0] = triangle[0];
        update(next);
      }
    }

    arc.forEach(relative);
  });

  function update(triangle) {
    heap.remove(triangle);
    triangle[1][2] = triangleArea(triangle);
    heap.push(triangle);
  }

  return topology;
}

var version = "1.6.27";

exports.version = version;
exports.mesh = mesh;
exports.meshArcs = meshArcs;
exports.merge = merge;
exports.mergeArcs = mergeArcs;
exports.feature = feature;
exports.neighbors = neighbors;
exports.presimplify = presimplify;

Object.defineProperty(exports, '__esModule', { value: true });

})));

/***/ }),

/***/ "nXcD":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    type = __webpack_require__("ggRp"),
    stats = __webpack_require__("uHQN"),
    template = __webpack_require__("yQql");

module.exports = {
  table:   formatTable,  // format a data table
  summary: formatSummary // format a data table summary
};

var FMT = {
  'date':    '|time:"%m/%d/%Y %H:%M:%S"',
  'number':  '|number:".4f"',
  'integer': '|number:"d"'
};

var POS = {
  'number':  'left',
  'integer': 'left'
};

function formatTable(data, opt) {
  opt = util.extend({separator:' ', minwidth: 8, maxwidth: 15}, opt);
  var fields = opt.fields || util.keys(data[0]),
      types = type.all(data);

  if (opt.start || opt.limit) {
    var a = opt.start || 0,
        b = opt.limit ? a + opt.limit : data.length;
    data = data.slice(a, b);
  }

  // determine char width of fields
  var lens = fields.map(function(name) {
    var format = FMT[types[name]] || '',
        t = template('{{' + name + format + '}}'),
        l = stats.max(data, function(x) { return t(x).length; });
    l = Math.max(Math.min(name.length, opt.minwidth), l);
    return opt.maxwidth > 0 ? Math.min(l, opt.maxwidth) : l;
  });

  // print header row
  var head = fields.map(function(name, i) {
    return util.truncate(util.pad(name, lens[i], 'center'), lens[i]);
  }).join(opt.separator);

  // build template function for each row
  var tmpl = template(fields.map(function(name, i) {
    return '{{' +
      name +
      (FMT[types[name]] || '') +
      ('|pad:' + lens[i] + ',' + (POS[types[name]] || 'right')) +
      ('|truncate:' + lens[i]) +
    '}}';
  }).join(opt.separator));

  // print table
  return head + "\n" + data.map(tmpl).join('\n');
}

function formatSummary(s) {
  s = s ? s.__summary__ ? s : stats.summary(s) : this;
  var str = [], i, n;
  for (i=0, n=s.length; i<n; ++i) {
    str.push('-- ' + s[i].field + ' --');
    if (s[i].type === 'string' || s[i].distinct < 10) {
      str.push(printCategoricalProfile(s[i]));
    } else {
      str.push(printQuantitativeProfile(s[i]));
    }
    str.push('');
  }
  return str.join('\n');
}

function printQuantitativeProfile(p) {
  return [
    'valid:    ' + p.valid,
    'missing:  ' + p.missing,
    'distinct: ' + p.distinct,
    'min:      ' + p.min,
    'max:      ' + p.max,
    'median:   ' + p.median,
    'mean:     ' + p.mean,
    'stdev:    ' + p.stdev,
    'modeskew: ' + p.modeskew
  ].join('\n');
}

function printCategoricalProfile(p) {
  var list = [
    'valid:    ' + p.valid,
    'missing:  ' + p.missing,
    'distinct: ' + p.distinct,
    'top values: '
  ];
  var u = p.unique;
  var top = util.keys(u)
    .sort(function(a,b) { return u[b] - u[a]; })
    .slice(0, 6)
    .map(function(v) { return ' \'' + v + '\' (' + u[v] + ')'; });
  return list.concat(top).join('\n');
}

/***/ }),

/***/ "nj7R":
/***/ (function(module, exports) {

module.exports = function(codegen) {

  function fncall(name, args, cast, type) {
    var obj = codegen(args[0]);
    if (cast) {
      obj = cast + '(' + obj + ')';
      if (cast.lastIndexOf('new ', 0) === 0) obj = '(' + obj + ')';
    }
    return obj + '.' + name + (type < 0 ? '' : type === 0 ?
      '()' :
      '(' + args.slice(1).map(codegen).join(',') + ')');
  }

  function fn(name, cast, type) {
    return function(args) {
      return fncall(name, args, cast, type);
    };
  }

  var DATE = 'new Date',
      STRING = 'String',
      REGEXP = 'RegExp';

  return {
    // MATH functions
    'isNaN':    'isNaN',
    'isFinite': 'isFinite',
    'abs':      'Math.abs',
    'acos':     'Math.acos',
    'asin':     'Math.asin',
    'atan':     'Math.atan',
    'atan2':    'Math.atan2',
    'ceil':     'Math.ceil',
    'cos':      'Math.cos',
    'exp':      'Math.exp',
    'floor':    'Math.floor',
    'log':      'Math.log',
    'max':      'Math.max',
    'min':      'Math.min',
    'pow':      'Math.pow',
    'random':   'Math.random',
    'round':    'Math.round',
    'sin':      'Math.sin',
    'sqrt':     'Math.sqrt',
    'tan':      'Math.tan',

    'clamp': function(args) {
      if (args.length < 3)
        throw new Error('Missing arguments to clamp function.');
      if (args.length > 3)
        throw new Error('Too many arguments to clamp function.');
      var a = args.map(codegen);
      return 'Math.max('+a[1]+', Math.min('+a[2]+','+a[0]+'))';
    },

    // DATE functions
    'now':             'Date.now',
    'utc':             'Date.UTC',
    'datetime':        DATE,
    'date':            fn('getDate', DATE, 0),
    'day':             fn('getDay', DATE, 0),
    'year':            fn('getFullYear', DATE, 0),
    'month':           fn('getMonth', DATE, 0),
    'hours':           fn('getHours', DATE, 0),
    'minutes':         fn('getMinutes', DATE, 0),
    'seconds':         fn('getSeconds', DATE, 0),
    'milliseconds':    fn('getMilliseconds', DATE, 0),
    'time':            fn('getTime', DATE, 0),
    'timezoneoffset':  fn('getTimezoneOffset', DATE, 0),
    'utcdate':         fn('getUTCDate', DATE, 0),
    'utcday':          fn('getUTCDay', DATE, 0),
    'utcyear':         fn('getUTCFullYear', DATE, 0),
    'utcmonth':        fn('getUTCMonth', DATE, 0),
    'utchours':        fn('getUTCHours', DATE, 0),
    'utcminutes':      fn('getUTCMinutes', DATE, 0),
    'utcseconds':      fn('getUTCSeconds', DATE, 0),
    'utcmilliseconds': fn('getUTCMilliseconds', DATE, 0),

    // shared sequence functions
    'length':      fn('length', null, -1),
    'indexof':     fn('indexOf', null),
    'lastindexof': fn('lastIndexOf', null),

    // STRING functions
    'parseFloat':  'parseFloat',
    'parseInt':    'parseInt',
    'upper':       fn('toUpperCase', STRING, 0),
    'lower':       fn('toLowerCase', STRING, 0),
    'slice':       fn('slice', STRING),
    'substring':   fn('substring', STRING),
    'replace':     fn('replace', STRING),

    // REGEXP functions
    'regexp':  REGEXP,
    'test':    fn('test', REGEXP),

    // Control Flow functions
    'if': function(args) {
        if (args.length < 3)
          throw new Error('Missing arguments to if function.');
        if (args.length > 3)
          throw new Error('Too many arguments to if function.');
        var a = args.map(codegen);
        return '('+a[0]+'?'+a[1]+':'+a[2]+')';
      }
  };
};


/***/ }),

/***/ "o+e1":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var aggregate_1 = __webpack_require__("h/tW");
var scale_1 = __webpack_require__("Fw/k");
var timeunit_1 = __webpack_require__("z5TJ");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
exports.aggregate = {
    type: 'string',
    enum: aggregate_1.AGGREGATE_OPS,
    supportedEnums: {
        quantitative: aggregate_1.AGGREGATE_OPS,
        ordinal: ['median', 'min', 'max'],
        nominal: [],
        temporal: ['mean', 'median', 'min', 'max'],
        '': ['count']
    },
    supportedTypes: util_1.toMap([type_1.QUANTITATIVE, type_1.NOMINAL, type_1.ORDINAL, type_1.TEMPORAL, ''])
};
function field(fieldDef, opt) {
    if (opt === void 0) { opt = {}; }
    var prefix = (opt.datum ? 'datum.' : '') + (opt.prefn || '');
    var suffix = opt.suffix || '';
    var field = fieldDef.field;
    if (isCount(fieldDef)) {
        return prefix + 'count' + suffix;
    }
    else if (opt.fn) {
        return prefix + opt.fn + '_' + field + suffix;
    }
    else if (!opt.nofn && fieldDef.bin) {
        var binSuffix = opt.binSuffix || (opt.scaleType === scale_1.ScaleType.ORDINAL ?
            '_range' :
            '_start');
        return prefix + 'bin_' + field + binSuffix;
    }
    else if (!opt.nofn && !opt.noAggregate && fieldDef.aggregate) {
        return prefix + fieldDef.aggregate + '_' + field + suffix;
    }
    else if (!opt.nofn && fieldDef.timeUnit) {
        return prefix + fieldDef.timeUnit + '_' + field + suffix;
    }
    else {
        return prefix + field;
    }
}
exports.field = field;
function _isFieldDimension(fieldDef) {
    return util_1.contains([type_1.NOMINAL, type_1.ORDINAL], fieldDef.type) || !!fieldDef.bin ||
        (fieldDef.type === type_1.TEMPORAL && !!fieldDef.timeUnit);
}
function isDimension(fieldDef) {
    return fieldDef && fieldDef.field && _isFieldDimension(fieldDef);
}
exports.isDimension = isDimension;
function isMeasure(fieldDef) {
    return fieldDef && fieldDef.field && !_isFieldDimension(fieldDef);
}
exports.isMeasure = isMeasure;
function count() {
    return { field: '*', aggregate: aggregate_1.AggregateOp.COUNT, type: type_1.QUANTITATIVE };
}
exports.count = count;
function isCount(fieldDef) {
    return fieldDef.aggregate === aggregate_1.AggregateOp.COUNT;
}
exports.isCount = isCount;
function cardinality(fieldDef, stats, filterNull) {
    if (filterNull === void 0) { filterNull = {}; }
    var stat = stats[fieldDef.field], type = fieldDef.type;
    if (fieldDef.bin) {
        var bin_1 = fieldDef.bin;
        var maxbins = (typeof bin_1 === 'boolean') ? undefined : bin_1.maxbins;
        if (maxbins === undefined) {
            maxbins = 10;
        }
        var bins = util_1.getbins(stat, maxbins);
        return (bins.stop - bins.start) / bins.step;
    }
    if (type === type_1.TEMPORAL) {
        var timeUnit = fieldDef.timeUnit;
        switch (timeUnit) {
            case timeunit_1.TimeUnit.SECONDS: return 60;
            case timeunit_1.TimeUnit.MINUTES: return 60;
            case timeunit_1.TimeUnit.HOURS: return 24;
            case timeunit_1.TimeUnit.DAY: return 7;
            case timeunit_1.TimeUnit.DATE: return 31;
            case timeunit_1.TimeUnit.MONTH: return 12;
            case timeunit_1.TimeUnit.QUARTER: return 4;
            case timeunit_1.TimeUnit.YEAR:
                var yearstat = stats['year_' + fieldDef.field];
                if (!yearstat) {
                    return null;
                }
                return yearstat.distinct -
                    (stat.missing > 0 && filterNull[type] ? 1 : 0);
        }
    }
    if (fieldDef.aggregate) {
        return 1;
    }
    return stat.distinct -
        (stat.missing > 0 && filterNull[type] ? 1 : 0);
}
exports.cardinality = cardinality;
function title(fieldDef, config) {
    if (fieldDef.title != null) {
        return fieldDef.title;
    }
    if (isCount(fieldDef)) {
        return config.countTitle;
    }
    var fn = fieldDef.aggregate || fieldDef.timeUnit || (fieldDef.bin && 'bin');
    if (fn) {
        return fn.toString().toUpperCase() + '(' + fieldDef.field + ')';
    }
    else {
        return fieldDef.field;
    }
}
exports.title = title;
//# sourceMappingURL=fielddef.js.map

/***/ }),

/***/ "oCE4":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  Handler:  __webpack_require__("2zc7"),
  Renderer: __webpack_require__("pEEJ")
};

/***/ }),

/***/ "oCPx":
/***/ (function(module, exports, __webpack_require__) {

var sg = __webpack_require__("LHV8").render,
    canvas = sg.canvas,
    svg = sg.svg.string,
    View = __webpack_require__("+5nH");

function HeadlessView(width, height, model) {
  View.call(this, width, height, model);
  this._type = 'canvas';
  this._renderers = {canvas: canvas, svg: svg};
}

var prototype = (HeadlessView.prototype = new View());

prototype.renderer = function(type) {
  if(type) this._type = type;
  return View.prototype.renderer.apply(this, arguments);
};

prototype.canvas = function() {
  return (this._type === 'canvas') ? this._renderer.canvas() : null;
};

prototype.canvasAsync = function(callback) {
  var r = this._renderer, view = this;

  function wait() {
    if (r.pendingImages() === 0) {
      view.render(); // re-render with all images
      callback(view.canvas());
    } else {
      setTimeout(wait, 10);
    }
  }

  // if images loading, poll until ready
  if (this._type !== 'canvas') return null;
  if (r.pendingImages() > 0) { wait(); } else { callback(this.canvas()); }
};

prototype.svg = function() {
  return (this._type === 'svg') ? this._renderer.svg() : null;
};

prototype.initialize = function() {
  var w = this._width,
      h = this._height,
      bg  = this._bgcolor,
      pad = this._padding,
      config = this.model().config();

  if (this._viewport) {
    w = this._viewport[0] - (pad ? pad.left + pad.right : 0);
    h = this._viewport[1] - (pad ? pad.top + pad.bottom : 0);
  }

  this._renderer = (this._renderer || new this._io.Renderer(config.load))
    .initialize(null, w, h, pad)
    .background(bg);

  return (this._repaint = true, this);
};

module.exports = HeadlessView;


/***/ }),

/***/ "pAWG":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var formula;
(function (formula_1) {
    function parse(model) {
        return (model.transform().calculate || []).reduce(function (formulaComponent, formula) {
            formulaComponent[util_1.hash(formula)] = formula;
            return formulaComponent;
        }, {});
    }
    formula_1.parseUnit = parse;
    function parseFacet(model) {
        var formulaComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            util_1.extend(formulaComponent, childDataComponent.calculate);
            delete childDataComponent.calculate;
        }
        return formulaComponent;
    }
    formula_1.parseFacet = parseFacet;
    function parseLayer(model) {
        var formulaComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (!childDataComponent.source && childDataComponent.calculate) {
                util_1.extend(formulaComponent || {}, childDataComponent.calculate);
                delete childDataComponent.calculate;
            }
        });
        return formulaComponent;
    }
    formula_1.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.vals(component.calculate).reduce(function (transform, formula) {
            transform.push(util_1.extend({ type: 'formula' }, formula));
            return transform;
        }, []);
    }
    formula_1.assemble = assemble;
})(formula = exports.formula || (exports.formula = {}));
//# sourceMappingURL=formula.js.map

/***/ }),

/***/ "pEEJ":
/***/ (function(module, exports, __webpack_require__) {

var DOM = __webpack_require__("sV93"),
    Bounds = __webpack_require__("lnKO"),
    ImageLoader = __webpack_require__("zLl/"),
    Canvas = __webpack_require__("WFOa"),
    Renderer = __webpack_require__("ZyfV"),
    marks = __webpack_require__("kC7m");

function CanvasRenderer(loadConfig) {
  Renderer.call(this);
  this._loader = new ImageLoader(loadConfig);
}

CanvasRenderer.RETINA = true;

var base = Renderer.prototype;
var prototype = (CanvasRenderer.prototype = Object.create(base));
prototype.constructor = CanvasRenderer;

prototype.initialize = function(el, width, height, padding) {
  this._canvas = Canvas.instance(width, height);
  if (el) {
    DOM.clear(el, 0).appendChild(this._canvas);
    this._canvas.setAttribute('class', 'marks');
  }
  return base.initialize.call(this, el, width, height, padding);
};

prototype.resize = function(width, height, padding) {
  base.resize.call(this, width, height, padding);
  Canvas.resize(this._canvas, this._width, this._height,
    this._padding, CanvasRenderer.RETINA);
  return this;
};

prototype.canvas = function() {
  return this._canvas;
};

prototype.context = function() {
  return this._canvas ? this._canvas.getContext('2d') : null;
};

prototype.pendingImages = function() {
  return this._loader.pending();
};

function clipToBounds(g, items) {
  if (!items) return null;

  var b = new Bounds(), i, n, item, mark, group;
  for (i=0, n=items.length; i<n; ++i) {
    item = items[i];
    mark = item.mark;
    group = mark.group;
    item = marks[mark.marktype].nested ? mark : item;
    b.union(translate(item.bounds, group));
    if (item['bounds:prev']) {
      b.union(translate(item['bounds:prev'], group));
    }
  }
  b.round();

  g.beginPath();
  g.rect(b.x1, b.y1, b.width(), b.height());
  g.clip();

  return b;
}

function translate(bounds, group) {
  if (group == null) return bounds;
  var b = bounds.clone();
  for (; group != null; group = group.mark.group) {
    b.translate(group.x || 0, group.y || 0);
  }
  return b;
}

prototype.render = function(scene, items) {
  var g = this.context(),
      p = this._padding,
      w = this._width + p.left + p.right,
      h = this._height + p.top + p.bottom,
      b;

  // setup
  this._scene = scene; // cache scene for async redraw
  g.save();
  b = clipToBounds(g, items);
  this.clear(-p.left, -p.top, w, h);

  // render
  this.draw(g, scene, b);
  
  // takedown
  g.restore();
  this._scene = null; // clear scene cache

  return this;
};

prototype.draw = function(ctx, scene, bounds) {
  var mark = marks[scene.marktype];
  mark.draw.call(this, ctx, scene, bounds);
};

prototype.clear = function(x, y, w, h) {
  var g = this.context();
  g.clearRect(x, y, w, h);
  if (this._bgcolor != null) {
    g.fillStyle = this._bgcolor;
    g.fillRect(x, y, w, h); 
  }
};

prototype.loadImage = function(uri) {
  var renderer = this,
      scene = this._scene;
  return this._loader.loadImage(uri, function() {
    renderer.renderAsync(scene);
  });
};

prototype.renderAsync = function(scene) {
  // TODO make safe for multiple scene rendering?
  var renderer = this;
  if (renderer._async_id) {
    clearTimeout(renderer._async_id);
  }
  renderer._async_id = setTimeout(function() {
    renderer.render(scene);
    delete renderer._async_id;
  }, 10);
};

module.exports = CanvasRenderer;


/***/ }),

/***/ "pKLr":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    df = __webpack_require__("Hqva"),
    Tuple = df.Tuple,
    ChangeSet = df.ChangeSet,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function Force(graph) {
  Transform.prototype.init.call(this, graph);

  this._prev = null;
  this._interactive = false;
  this._setup = true;
  this._nodes  = [];
  this._links = [];
  this._layout = d3.layout.force();

  Transform.addParameters(this, {
    size: {type: 'array<value>', default: __webpack_require__("MRce").size},
    bound: {type: 'value', default: true},
    links: {type: 'data'},

    // TODO: for now force these to be value params only (pun-intended)
    // Can update to include fields after Parameter refactoring.
    linkStrength: {type: 'value', default: 1},
    linkDistance: {type: 'value', default: 20},
    charge: {type: 'value', default: -30},

    chargeDistance: {type: 'value', default: Infinity},
    friction: {type: 'value', default: 0.9},
    theta: {type: 'value', default: 0.8},
    gravity: {type: 'value', default: 0.1},
    alpha: {type: 'value', default: 0.1},
    iterations: {type: 'value', default: 500},

    interactive: {type: 'value', default: this._interactive},
    active: {type: 'value', default: this._prev},
    fixed: {type: 'data'}
  });

  this._output = {
    'x': 'layout_x',
    'y': 'layout_y'
  };

  return this.mutates(true);
}

var prototype = (Force.prototype = Object.create(Transform.prototype));
prototype.constructor = Force;

prototype.transform = function(nodeInput, reset) {
  log.debug(nodeInput, ['force']);
  reset = reset - (nodeInput.signals.active ? 1 : 0);

  // get variables
  var interactive = this.param('interactive'),
      linkSource = this.param('links').source,
      linkInput = linkSource.last(),
      active = this.param('active'),
      output = this._output,
      layout = this._layout,
      nodes = this._nodes,
      links = this._links;

  // configure nodes, links and layout
  if (linkInput.stamp < nodeInput.stamp) linkInput = null;
  this.configure(nodeInput, linkInput, interactive, reset);

  // run batch layout
  if (!interactive) {
    var iterations = this.param('iterations');
    for (var i=0; i<iterations; ++i) layout.tick();
    layout.stop();
  }

  // update node positions
  this.update(active);

  // re-up alpha on parameter change
  if (reset || active !== this._prev && active && active.update) {
    layout.alpha(this.param('alpha')); // re-start layout
  }

  // update active node status,
  if (active !== this._prev) {
    this._prev = active;
  }

  // process removed nodes or edges
  if (nodeInput.rem.length) {
    layout.nodes(this._nodes = Tuple.idFilter(nodes, nodeInput.rem));
  }
  if (linkInput && linkInput.rem.length) {
    layout.links(this._links = Tuple.idFilter(links, linkInput.rem));
  }

  // return changeset
  nodeInput.fields[output.x] = 1;
  nodeInput.fields[output.y] = 1;
  return nodeInput;
};

prototype.configure = function(nodeInput, linkInput, interactive, reset) {
  // check if we need to run configuration
  var layout = this._layout,
      update = this._setup || nodeInput.add.length ||
            linkInput && linkInput.add.length ||
            interactive !== this._interactive ||
            this.param('charge') !== layout.charge() ||
            this.param('linkStrength') !== layout.linkStrength() ||
            this.param('linkDistance') !== layout.linkDistance();

  if (update || reset) {
    // a parameter changed, so update tick-only parameters
    layout
      .size(this.param('size'))
      .chargeDistance(this.param('chargeDistance'))
      .theta(this.param('theta'))
      .gravity(this.param('gravity'))
      .friction(this.param('friction'));
  }

  if (!update) return; // if no more updates needed, return now

  this._setup = false;
  this._interactive = interactive;

  var force = this,
      graph = this._graph,
      nodes = this._nodes,
      links = this._links, a, i;

  // process added nodes
  for (a=nodeInput.add, i=0; i<a.length; ++i) {
    nodes.push({tuple: a[i]});
  }

  // process added edges
  if (linkInput) for (a=linkInput.add, i=0; i<a.length; ++i) {
    // TODO add configurable source/target accessors
    // TODO support lookup by node id
    // TODO process 'mod' of edge source or target?
    links.push({
      tuple:  a[i],
      source: nodes[a[i].source],
      target: nodes[a[i].target]
    });
  }

  // setup handler for force layout tick events
  var tickHandler = !interactive ? null : function() {
    // re-schedule the transform, force reflow
    graph.propagate(ChangeSet.create(null, true), force);
  };

  // configure the rest of the layout
  layout
    .linkStrength(this.param('linkStrength'))
    .linkDistance(this.param('linkDistance'))
    .charge(this.param('charge'))
    .nodes(nodes)
    .links(links)
    .on('tick', tickHandler)
    .start().alpha(this.param('alpha'));
};

prototype.update = function(active) {
  var output = this._output,
      bound = this.param('bound'),
      fixed = this.param('fixed'),
      size = this.param('size'),
      nodes = this._nodes,
      lut = {}, id, i, n, t, x, y;

  if (fixed && fixed.source) {
    // TODO: could cache and update as needed?
    fixed = fixed.source.values();
    for (i=0, n=fixed.length; i<n; ++i) {
      lut[fixed[i].id] = 1;
    }
  }

  for (i=0; i<nodes.length; ++i) {
    n = nodes[i];
    t = n.tuple;
    id = t._id;

    if (active && active.id === id) {
      n.fixed = 1;
      if (active.update) {
        n.x = n.px = active.x;
        n.y = n.py = active.y;
      }
    } else {
      n.fixed = lut[id] || 0;
    }

    x = bound ? Math.max(0, Math.min(n.x, size[0])) : n.x;
    y = bound ? Math.max(0, Math.min(n.y, size[1])) : n.y;
    Tuple.set(t, output.x, x);
    Tuple.set(t, output.y, y);
  }
};

module.exports = Force;

Force.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Force transform",
  "description": "Performs force-directed layout for network data.",
  "type": "object",
  "properties": {
    "type": {"enum": ["force"]},
    "size": {
      "description": "The dimensions [width, height] of this force layout.",
      "oneOf": [
        {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {"oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],

      "default": [500, 500]
    },
    "links": {
      "type": "string",
      "description": "The name of the link (edge) data set."
    },
    "linkDistance": {
      "description": "Determines the length of edges, in pixels.",
      "oneOf": [{"type": "number"}, {"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": 20
    },
    "linkStrength": {
      "oneOf": [{"type": "number"}, {"type": "string"}, {"$ref": "#/refs/signal"}],
      "description": "Determines the tension of edges (the spring constant).",
      "default": 1
    },
    "charge": {
      "oneOf": [{"type": "number"}, {"type": "string"}, {"$ref": "#/refs/signal"}],
      "description": "The strength of the charge each node exerts.",
      "default": -30
    },
    "chargeDistance": {
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "description": "The maximum distance over which charge forces are applied.",
      "default": Infinity
    },
    "iterations": {
      "description": "The number of iterations to run the force directed layout.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": 500
    },
    "friction": {
      "description": "The strength of the friction force used to stabilize the layout.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": 0.9
    },
    "theta": {
      "description": "The theta parameter for the Barnes-Hut algorithm, which is used to compute charge forces between nodes.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": 0.8
    },
    "gravity": {
      "description": "The strength of the pseudo-gravity force that pulls nodes towards the center of the layout area.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": 0.1
    },
    "alpha": {
      "description": "A \"temperature\" parameter that determines how much node positions are adjusted at each step.",
      "oneOf": [{"type": "number"}, {"$ref": "#/refs/signal"}],
      "default": 0.1
    },
    "interactive": {
      "description": "Enables an interactive force-directed layout.",
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "default": false
    },
    "active": {
      "description": "A signal representing the active node.",
      "$ref": "#/refs/signal"
    },
    "fixed": {
      "description": "The name of a datasource containing the IDs of nodes with fixed positions.",
      "type": "string"
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "x": {"type": "string", "default": "layout_x"},
        "y": {"type": "string", "default": "layout_y"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type", "links"]
};


/***/ }),

/***/ "pYy3":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");
var d3_dsv = __webpack_require__("SAbC");

function dsv(data, format) {
  if (data) {
    var h = format.header;
    data = (h ? h.join(format.delimiter) + '\n' : '') + data;
  }
  return d3_dsv.dsv(format.delimiter).parse(data);
}

dsv.delimiter = function(delim) {
  var fmt = {delimiter: delim};
  return function(data, format) {
    return dsv(data, format ? util.extend(format, fmt) : fmt);
  };
};

module.exports = dsv;


/***/ }),

/***/ "pfe9":
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  parse:  __webpack_require__("eJnU"),
  render: __webpack_require__("bSC/")
};


/***/ }),

/***/ "prMK":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    time = __webpack_require__("mgrV"),
    EPSILON = 1e-15;

function bins(opt) {
  if (!opt) { throw Error("Missing binning options."); }

  // determine range
  var maxb = opt.maxbins || 15,
      base = opt.base || 10,
      logb = Math.log(base),
      div = opt.div || [5, 2],
      min = opt.min,
      max = opt.max,
      span = max - min,
      step, level, minstep, precision, v, i, eps;

  if (opt.step) {
    // if step size is explicitly given, use that
    step = opt.step;
  } else if (opt.steps) {
    // if provided, limit choice to acceptable step sizes
    step = opt.steps[Math.min(
      opt.steps.length - 1,
      bisect(opt.steps, span/maxb, 0, opt.steps.length)
    )];
  } else {
    // else use span to determine step size
    level = Math.ceil(Math.log(maxb) / logb);
    minstep = opt.minstep || 0;
    step = Math.max(
      minstep,
      Math.pow(base, Math.round(Math.log(span) / logb) - level)
    );

    // increase step size if too many bins
    while (Math.ceil(span/step) > maxb) { step *= base; }

    // decrease step size if allowed
    for (i=0; i<div.length; ++i) {
      v = step / div[i];
      if (v >= minstep && span / v <= maxb) step = v;
    }
  }

  // update precision, min and max
  v = Math.log(step);
  precision = v >= 0 ? 0 : ~~(-v / logb) + 1;
  eps = Math.pow(base, -precision - 1);
  min = Math.min(min, Math.floor(min / step + eps) * step);
  max = Math.ceil(max / step) * step;

  return {
    start: min,
    stop:  max,
    step:  step,
    unit:  {precision: precision},
    value: value,
    index: index
  };
}

function bisect(a, x, lo, hi) {
  while (lo < hi) {
    var mid = lo + hi >>> 1;
    if (util.cmp(a[mid], x) < 0) { lo = mid + 1; }
    else { hi = mid; }
  }
  return lo;
}

function value(v) {
  return this.step * Math.floor(v / this.step + EPSILON);
}

function index(v) {
  return Math.floor((v - this.start) / this.step + EPSILON);
}

function date_value(v) {
  return this.unit.date(value.call(this, v));
}

function date_index(v) {
  return index.call(this, this.unit.unit(v));
}

bins.date = function(opt) {
  if (!opt) { throw Error("Missing date binning options."); }

  // find time step, then bin
  var units = opt.utc ? time.utc : time,
      dmin = opt.min,
      dmax = opt.max,
      maxb = opt.maxbins || 20,
      minb = opt.minbins || 4,
      span = (+dmax) - (+dmin),
      unit = opt.unit ? units[opt.unit] : units.find(span, minb, maxb),
      spec = bins({
        min:     unit.min != null ? unit.min : unit.unit(dmin),
        max:     unit.max != null ? unit.max : unit.unit(dmax),
        maxbins: maxb,
        minstep: unit.minstep,
        steps:   unit.step
      });

  spec.unit = unit;
  spec.index = date_index;
  if (!opt.raw) spec.value = date_value;
  return spec;
};

module.exports = bins;


/***/ }),

/***/ "pyUU":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var encoding_1 = __webpack_require__("QSMf");
var fielddef_1 = __webpack_require__("o+e1");
var mark_1 = __webpack_require__("j8cM");
var util_1 = __webpack_require__("ZAUf");
function initMarkConfig(mark, encoding, config) {
    return util_1.extend(['filled', 'opacity', 'orient', 'align'].reduce(function (cfg, property) {
        var value = config.mark[property];
        switch (property) {
            case 'filled':
                if (value === undefined) {
                    cfg[property] = mark !== mark_1.POINT && mark !== mark_1.LINE && mark !== mark_1.RULE;
                }
                break;
            case 'opacity':
                if (value === undefined) {
                    if (util_1.contains([mark_1.POINT, mark_1.TICK, mark_1.CIRCLE, mark_1.SQUARE], mark)) {
                        if (!encoding_1.isAggregate(encoding) || encoding_1.has(encoding, channel_1.DETAIL)) {
                            cfg[property] = 0.7;
                        }
                    }
                    if (mark === mark_1.AREA) {
                        cfg[property] = 0.7;
                    }
                }
                break;
            case 'orient':
                var xIsMeasure = fielddef_1.isMeasure(encoding.x) || fielddef_1.isMeasure(encoding.x2);
                var yIsMeasure = fielddef_1.isMeasure(encoding.y) || fielddef_1.isMeasure(encoding.y2);
                if (xIsMeasure && !yIsMeasure) {
                    if (mark === mark_1.TICK) {
                        cfg[property] = 'vertical';
                    }
                    else {
                        cfg[property] = 'horizontal';
                    }
                }
                else if (!xIsMeasure && yIsMeasure) {
                    if (mark === mark_1.TICK) {
                        cfg[property] = 'horizontal';
                    }
                    else {
                        cfg[property] = 'vertical';
                    }
                }
                break;
            case 'align':
                if (value === undefined) {
                    cfg[property] = encoding_1.has(encoding, channel_1.X) ? 'center' : 'right';
                }
        }
        return cfg;
    }, {}), config.mark);
}
exports.initMarkConfig = initMarkConfig;
//# sourceMappingURL=config.js.map

/***/ }),

/***/ "qmQ9":
/***/ (function(module, exports, __webpack_require__) {

var bins = __webpack_require__("prMK"),
    gen  = __webpack_require__("YsQl"),
    type = __webpack_require__("ggRp"),
    util = __webpack_require__("zF6n"),
    stats = __webpack_require__("uHQN");

var qtype = {
  'integer': 1,
  'number': 1,
  'date': 1
};

function $bin(values, f, opt) {
  opt = options(values, f, opt);
  var b = spec(opt);
  return !b ? (opt.accessor || util.identity) :
    util.$func('bin', b.unit.unit ?
      function(x) { return b.value(b.unit.unit(x)); } :
      function(x) { return b.value(x); }
    )(opt.accessor);
}

function histogram(values, f, opt) {
  opt = options(values, f, opt);
  var b = spec(opt);
  return b ?
    numerical(values, opt.accessor, b) :
    categorical(values, opt.accessor, opt && opt.sort);
}

function spec(opt) {
  var t = opt.type, b = null;
  if (t == null || qtype[t]) {
    if (t === 'integer' && opt.minstep == null) opt.minstep = 1;
    b = (t === 'date') ? bins.date(opt) : bins(opt);
  }
  return b;
}

function options() {
  var a = arguments,
      i = 0,
      values = util.isArray(a[i]) ? a[i++] : null,
      f = util.isFunction(a[i]) || util.isString(a[i]) ? util.$(a[i++]) : null,
      opt = util.extend({}, a[i]);

  if (values) {
    opt.type = opt.type || type(values, f);
    if (qtype[opt.type]) {
      var ext = stats.extent(values, f);
      opt = util.extend({min: ext[0], max: ext[1]}, opt);
    }
  }
  if (f) { opt.accessor = f; }
  return opt;
}

function numerical(values, f, b) {
  var h = gen.range(b.start, b.stop + b.step/2, b.step)
    .map(function(v) { return {value: b.value(v), count: 0}; });

  for (var i=0, v, j; i<values.length; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      j = b.index(v);
      if (j < 0 || j >= h.length || !isFinite(j)) continue;
      h[j].count += 1;
    }
  }
  h.bins = b;
  return h;
}

function categorical(values, f, sort) {
  var u = stats.unique(values, f),
      c = stats.count.map(values, f);
  return u.map(function(k) { return {value: k, count: c[k]}; })
    .sort(util.comparator(sort ? '-count' : '+value'));
}

module.exports = {
  $bin: $bin,
  histogram: histogram
};


/***/ }),

/***/ "qnrb":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/");

function draw(g, scene, bounds) {
  if (!scene.items || !scene.items.length) return;

  var items = scene.items,
      o, opac, x1, y1, x2, y2;

  for (var i=0, len=items.length; i<len; ++i) {
    o = items[i];
    if (bounds && !bounds.intersects(o.bounds))
      continue; // bounds check

    opac = o.opacity == null ? 1 : o.opacity;
    if (opac === 0) continue;
      
    x1 = o.x || 0;
    y1 = o.y || 0;
    x2 = o.x2 != null ? o.x2 : x1;
    y2 = o.y2 != null ? o.y2 : y1;

    if (o.stroke && util.stroke(g, o, opac)) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
  }
}

function stroke(g, o) {
  var x1 = o.x || 0,
      y1 = o.y || 0,
      x2 = o.x2 != null ? o.x2 : x1,
      y2 = o.y2 != null ? o.y2 : y1,
      lw = o.strokeWidth,
      lc = o.strokeCap;

  g.lineWidth = lw != null ? lw : 1;
  g.lineCap   = lc != null ? lc : 'butt';
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
}

function hit(g, o, x, y) {
  if (!g.isPointInStroke) return false;
  stroke(g, o);
  return g.isPointInStroke(x, y);
}

module.exports = {
  draw: draw,
  pick: util.pick(hit)
};


/***/ }),

/***/ "r7he":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    df = __webpack_require__("Hqva"),
    Node = df.Node, // jshint ignore:line
    Tuple = df.Tuple,
    Deps = df.Dependencies;

var Types = {
  INSERT: "insert",
  REMOVE: "remove",
  UPSERT: "upsert",
  TOGGLE: "toggle",
  CLEAR:  "clear"
};

var EMPTY = [];

function filter(fields, value, src, dest) {
  var splice = true, len = fields.length, i, j, f, v;
  for (i = src.length - 1; i >= 0; --i) {
    for (j=0; j<len; ++j) {
      f = fields[j];
      v = value && f(value) || value;
      if (f(src[i]) !== v) {
        splice = false;
        break;
      }
    }

    if (splice) dest.push.apply(dest, src.splice(i, 1));
    splice = true;
  }
}

function insert(input, datum, source) {
  var t = Tuple.ingest(datum);
  input.add.push(t);
  source._data.push(t);
}

function parseModify(model, def, ds) {
  var signal = def.signal ? dl.field(def.signal) : null,
      signalName  = signal ? signal[0] : null,
      predicate   = def.predicate ? model.predicate(def.predicate.name || def.predicate) : null,
      exprTrigger = def.test ? model.expr(def.test) : null,
      reeval  = (predicate === null && exprTrigger === null),
      isClear = def.type === Types.CLEAR,
      fields  = dl.array(def.field || 'data'),
      getters = fields.map(dl.accessor),
      setters = fields.map(dl.mutator),
      node = new Node(model).router(isClear);

  node.evaluate = function(input) {
    var db, sg;

    if (predicate !== null) {  // TODO: predicate args
      db = model.values(Deps.DATA, predicate.data || EMPTY);
      sg = model.values(Deps.SIGNALS, predicate.signals || EMPTY);
      reeval = predicate.call(predicate, {}, db, sg, model._predicates);
    }

    if (exprTrigger !== null) {
      sg = model.values(Deps.SIGNALS, exprTrigger.globals || EMPTY);
      reeval = exprTrigger.fn();
    }

    log.debug(input, [def.type+"ing", reeval]);
    if (!reeval || (!isClear && !input.signals[signalName])) return input;

    var value = signal ? model.signalRef(def.signal) : null,
        d = model.data(ds.name),
        t = null, add = [], rem = [], up = 0, datum;

    if (dl.isObject(value)) {
      datum = value;
      if (!def.field) {
        fields = dl.keys(datum);
        getters = fields.map(dl.accessor);
        setters = fields.map(dl.mutator);
      }
    } else {
      datum = {};
      setters.forEach(function(f) { f(datum, value); });
    }

    // We have to modify ds._data so that subsequent pulses contain
    // our dynamic data. W/o modifying ds._data, only the output
    // collector will contain dynamic tuples.
    if (def.type === Types.INSERT) {
      insert(input, datum, d);
    } else if (def.type === Types.REMOVE) {
      filter(getters, value, input.mod, input.rem);
      filter(getters, value, input.add, rem);
      filter(getters, value, d._data, rem);
    } else if (def.type === Types.UPSERT) {
      input.mod.forEach(function(x) {
        var every = getters.every(function(f) {
          return f(x) === f(datum);
        });

        if (every) up = (dl.extend(x, datum), up+1);
      });

      if (up === 0) insert(input, datum, d);
    } else if (def.type === Types.TOGGLE) {
      // If tuples are in mod, remove them.
      filter(getters, value, input.mod, rem);
      input.rem.push.apply(input.rem, rem);

      // If tuples are in add, they've been added to backing data source,
      // but no downstream operators will have seen it yet.
      filter(getters, value, input.add, add);

      if (add.length || rem.length) {
        d._data = d._data.filter(function(x) {
          return rem.indexOf(x) < 0 && add.indexOf(x) < 0;
        });
      } else {
        // If the tuples aren't seen in the changeset, add a new tuple.
        // Note, tuple might be in input.rem, but we ignore this and just
        // re-add a new tuple for simplicity.
        input.add.push(t=Tuple.ingest(datum));
        d._data.push(t);
      }
    } else if (def.type === Types.CLEAR) {
      input.rem.push.apply(input.rem, input.mod.splice(0));
      input.add.splice(0);
      d._data.splice(0);
    }

    fields.forEach(function(f) { input.fields[f] = 1; });
    return input;
  };

  if (signalName) node.dependency(Deps.SIGNALS, signalName);

  if (predicate) {
    node.dependency(Deps.DATA, predicate.data);
    node.dependency(Deps.SIGNALS, predicate.signals);
  }

  if (exprTrigger) {
    node.dependency(Deps.SIGNALS, exprTrigger.globals);
    node.dependency(Deps.DATA,    exprTrigger.dataSources);
  }

  return node;
}

module.exports = parseModify;
parseModify.schema = {
  "defs": {
    "modify": {
      "type": "array",
      "items": {
        "type": "object",
        "oneOf": [{
          "properties": {
            "type": {"enum": [
              Types.INSERT, Types.REMOVE, Types.UPSERT, Types.TOGGLE
            ]},
            "signal": {"type": "string"},
            "field": {"type": "string"}
          },
          "required": ["type", "signal"]
        }, {
          "properties": {
            "type": {"enum": [Types.CLEAR]},
            "predicate": {"type": "string"}  // TODO predicate args
          },
          "required": ["type", "predicate"]
        },
        {
          "properties": {
            "type": {"enum": [Types.CLEAR]},
            "test": {"type": "string"}
          },
          "required": ["type", "test"]
        }]
      }
    }
  }
};


/***/ }),

/***/ "rCVn":
/***/ (function(module, exports, __webpack_require__) {

var Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs");

function LinkPath(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    sourceX:  {type: 'field', default: '_source.layout_x'},
    sourceY:  {type: 'field', default: '_source.layout_y'},
    targetX:  {type: 'field', default: '_target.layout_x'},
    targetY:  {type: 'field', default: '_target.layout_y'},
    tension:  {type: 'value', default: 0.2},
    shape:    {type: 'value', default: 'line'}
  });

  this._output = {'path': 'layout_path'};
  return this.mutates(true);
}

var prototype = (LinkPath.prototype = Object.create(Transform.prototype));
prototype.constructor = LinkPath;

function line(sx, sy, tx, ty) {
  return 'M' + sx + ',' + sy +
         'L' + tx + ',' + ty;
}

function curve(sx, sy, tx, ty, tension) {
  var dx = tx - sx,
      dy = ty - sy,
      ix = tension * (dx + dy),
      iy = tension * (dy - dx);
  return 'M' + sx + ',' + sy +
         'C' + (sx+ix) + ',' + (sy+iy) +
         ' ' + (tx+iy) + ',' + (ty-ix) +
         ' ' + tx + ',' + ty;
}

function cornerX(sx, sy, tx, ty) {
  return 'M' + sx + ',' + sy +
         'V' + ty + 'H' + tx;
}

function cornerY(sx, sy, tx, ty) {
  return 'M' + sx + ',' + sy +
         'H' + tx + 'V' + ty;
}

function cornerR(sa, sr, ta, tr) {
  var sc = Math.cos(sa),
      ss = Math.sin(sa),
      tc = Math.cos(ta),
      ts = Math.sin(ta),
      sf = Math.abs(ta - sa) > Math.PI ? ta <= sa : ta > sa;
  return 'M' + (sr*sc) + ',' + (sr*ss) +
         'A' + sr + ',' + sr + ' 0 0,' + (sf?1:0) +
         ' ' + (sr*tc) + ',' + (sr*ts) +
         'L' + (tr*tc) + ',' + (tr*ts);
}

function diagonalX(sx, sy, tx, ty) {
  var m = (sx + tx) / 2;
  return 'M' + sx + ',' + sy +
         'C' + m  + ',' + sy +
         ' ' + m  + ',' + ty +
         ' ' + tx + ',' + ty;
}

function diagonalY(sx, sy, tx, ty) {
  var m = (sy + ty) / 2;
  return 'M' + sx + ',' + sy +
         'C' + sx + ',' + m +
         ' ' + tx + ',' + m +
         ' ' + tx + ',' + ty;
}

function diagonalR(sa, sr, ta, tr) {
  var sc = Math.cos(sa),
      ss = Math.sin(sa),
      tc = Math.cos(ta),
      ts = Math.sin(ta),
      mr = (sr + tr) / 2;
  return 'M' + (sr*sc) + ',' + (sr*ss) +
         'C' + (mr*sc) + ',' + (mr*ss) +
         ' ' + (mr*tc) + ',' + (mr*ts) +
         ' ' + (tr*tc) + ',' + (tr*ts);
}

var shapes = {
  line:      line,
  curve:     curve,
  cornerX:   cornerX,
  cornerY:   cornerY,
  cornerR:   cornerR,
  diagonalX: diagonalX,
  diagonalY: diagonalY,
  diagonalR: diagonalR
};

prototype.transform = function(input) {
  log.debug(input, ['linkpath']);

  var output = this._output,
      shape = shapes[this.param('shape')] || shapes.line,
      sourceX = this.param('sourceX').accessor,
      sourceY = this.param('sourceY').accessor,
      targetX = this.param('targetX').accessor,
      targetY = this.param('targetY').accessor,
      tension = this.param('tension');

  function set(t) {
    var path = shape(sourceX(t), sourceY(t), targetX(t), targetY(t), tension);
    Tuple.set(t, output.path, path);
  }

  input.add.forEach(set);
  if (this.reevaluate(input)) {
    input.mod.forEach(set);
    input.rem.forEach(set);
  }

  input.fields[output.path] = 1;
  return input;
};

module.exports = LinkPath;

LinkPath.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "LinkPath transform",
  "description": "Computes a path definition for connecting nodes within a node-link network or tree diagram.",
  "type": "object",
  "properties": {
    "type": {"enum": ["linkpath"]},
    "sourceX": {
      "description": "The data field that references the source x-coordinate for this link.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "_source"
    },
    "sourceY": {
      "description": "The data field that references the source y-coordinate for this link.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "_source"
    },
    "targetX": {
      "description": "The data field that references the target x-coordinate for this link.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "_target"
    },
    "targetY": {
      "description": "The data field that references the target y-coordinate for this link.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "default": "_target"
    },
    "tension": {
      "description": "A tension parameter for the \"tightness\" of \"curve\"-shaped links.",
      "oneOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        {"$ref": "#/refs/signal"}
      ],
      "default": 0.2
    },
    "shape": {
      "description": "The path shape to use",
      "oneOf": [
        {"enum": ["line", "curve", "cornerX", "cornerY", "cornerR", "diagonalX", "diagonalY", "diagonalR"]},
        {"$ref": "#/refs/signal"}
      ],
      "default": "line"
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "path": {"type": "string", "default": "layout_path"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "rKP5":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var fielddef_1 = __webpack_require__("o+e1");
var common_1 = __webpack_require__("MtYt");
var point;
(function (point) {
    function markType() {
        return 'symbol';
    }
    point.markType = markType;
    function properties(model, fixedShape) {
        var p = {};
        var config = model.config();
        p.x = x(model.encoding().x, model.scaleName(channel_1.X), config);
        p.y = y(model.encoding().y, model.scaleName(channel_1.Y), config);
        p.size = size(model.encoding().size, model.scaleName(channel_1.SIZE), model.scale(channel_1.SIZE), config);
        p.shape = shape(model.encoding().shape, model.scaleName(channel_1.SHAPE), model.scale(channel_1.SHAPE), config, fixedShape);
        common_1.applyColorAndOpacity(p, model);
        return p;
    }
    point.properties = properties;
    function x(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
        }
        return { value: config.scale.bandSize / 2 };
    }
    function y(fieldDef, scaleName, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { binSuffix: '_mid' })
                };
            }
        }
        return { value: config.scale.bandSize / 2 };
    }
    function size(fieldDef, scaleName, scale, config) {
        if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { scaleType: scale.type })
                };
            }
            else if (fieldDef.value !== undefined) {
                return { value: fieldDef.value };
            }
        }
        return { value: config.mark.size };
    }
    function shape(fieldDef, scaleName, scale, config, fixedShape) {
        if (fixedShape) {
            return { value: fixedShape };
        }
        else if (fieldDef) {
            if (fieldDef.field) {
                return {
                    scale: scaleName,
                    field: fielddef_1.field(fieldDef, { scaleType: scale.type })
                };
            }
            else if (fieldDef.value) {
                return { value: fieldDef.value };
            }
        }
        return { value: config.mark.shape };
    }
})(point = exports.point || (exports.point = {}));
var circle;
(function (circle) {
    function markType() {
        return 'symbol';
    }
    circle.markType = markType;
    function properties(model) {
        return point.properties(model, 'circle');
    }
    circle.properties = properties;
    function labels(model) {
        return undefined;
    }
    circle.labels = labels;
})(circle = exports.circle || (exports.circle = {}));
var square;
(function (square) {
    function markType() {
        return 'symbol';
    }
    square.markType = markType;
    function properties(model) {
        return point.properties(model, 'square');
    }
    square.properties = properties;
    function labels(model) {
        return undefined;
    }
    square.labels = labels;
})(square = exports.square || (exports.square = {}));
//# sourceMappingURL=point.js.map

/***/ }),

/***/ "rVSZ":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    $ = __webpack_require__("YzNj").util.mutator;

module.exports = {
  init: function(el, param, spec) {
    return (rewrite(param, spec), handle(el, param));
  },
  bind: function(param, view) {
    param.dom.forEach(function(el) { el.__vega__ = view; });
    view.onSignal(param.dom[0].name, function(k, v) { param.set(v); });
  }
};

// spec re-write

function rewrite(param, spec) {
  // add signal to top-level if not defined
  var sg = spec.signals || (spec.signals = []);
  for (var i=0; i<sg.length; ++i) {
    if (sg[i].name === param.signal) break;
  }
  if (i === sg.length) {
    sg.push({
      name: param.signal,
      init: param.value
    });
  }

  // replace values for re-write entries
  (param.rewrite || []).forEach(function(path) {
    $(path)(spec, {signal: param.signal});
  });
}

// HTML output handlers

function handle(el, param) {
  var p = el.append('div')
    .attr('class', 'vega-param');

  p.append('span')
    .attr('class', 'vega-param-name')
    .text(param.name || param.signal);

  var input = form;
  switch (param.type) {
    case 'checkbox': input = checkbox; break;
    case 'select':   input = select; break;
    case 'radio':    input = radio; break;
    case 'range':    input = range; break;
  }

  return input(p, param);
}

function form(el, param) {
  var fm = el.append('input')
    .on('input', update);

  for (var key in param) {
    if (key === 'signal' || key === 'rewrite') continue;
    fm.attr(key, param[key]);
  }
  fm.attr('name', param.signal);

  var node = fm.node();
  return {
    dom: [node],
    set: function(value) { node.value = value; }
  };
}

function checkbox(el, param) {
  var cb = el.append('input')
    .on('change', function() { update.call(this, this.checked); })
    .attr('type', 'checkbox')
    .attr('name', param.signal)
    .attr('checked', param.value || null)
    .node();

  return {
    dom: [cb],
    set: function(value) { cb.checked = !!value || null; }
  };
}

function select(el, param) {
  var sl = el.append('select')
    .attr('name', param.signal)
    .on('change', function() {
      update.call(this, this.options[this.selectedIndex].__data__);
    });

  sl.selectAll('option')
    .data(param.options)
   .enter().append('option')
    .attr('value', vg.util.identity)
    .attr('selected', function(x) { return x === param.value || null; })
    .text(vg.util.identity);
  
  var node = sl.node();
  return {
    dom: [node],
    set: function(value) {
      var idx = param.options.indexOf(value);
      node.selectedIndex = idx;
    }
  };
}

function radio(el, param) {
  var rg = el.append('span')
    .attr('class', 'vega-param-radio');

  var nodes = param.options.map(function(option) {
    var id = 'vega-option-' + param.signal + '-' + option;

    var rb = rg.append('input')
      .datum(option)
      .on('change', update)
      .attr('id', id)
      .attr('type', 'radio')
      .attr('name', param.signal)
      .attr('value', option)
      .attr('checked', option === param.value || null);

    rg.append('label')
      .attr('for', id)
      .text(option);

    return rb.node();
  });

  return {
    dom: nodes,
    set: function(value) {
      for (var i=0; i<nodes.length; ++i) {
        if (nodes[i].value === value) {
          nodes[i].checked = true;
        }
      }
    }
  };
}

function range(el, param) {
  var val = param.value !== undefined ? param.value :
    ((+param.max) + (+param.min)) / 2;

  var rn = el.append('input')
    .on('input', function() {
      lbl.text(this.value);
      update.call(this, +this.value);
    })
    .attr('type', 'range')
    .attr('name', param.signal)
    .attr('value', val)
    .attr('min', param.min)
    .attr('max', param.max)
    .attr('step', param.step || vg.util.bins({
      min: param.min,
      max: param.max,
      maxbins: 100
    }).step);

  var lbl = el.append('label')
    .attr('class', 'vega-range')
    .text(val);

  var node = rn.node();
  return {
    dom: [node],
    set: function(value) {
      node.value = value;
      lbl.text(value);
    }
  };
}

function update(value) {
  if (value === undefined) value = this.__data__ || d3.event.target.value;
  this.__vega__.signal(this.name, value).update();
}


/***/ }),

/***/ "rfWk":
/***/ (function(module, exports, __webpack_require__) {

var text = __webpack_require__("3Scv"),
    SVG = __webpack_require__("zhsD"),
    symbolTypes = SVG.symbolTypes,
    textAlign = SVG.textAlign,
    path = SVG.path;

function translateItem(o) {
  return translate(o.x || 0, o.y || 0);
}

function translate(x, y) {
  return 'translate(' + x + ',' + y + ')';
}

module.exports = {
  arc: {
    tag:  'path',
    type: 'arc',
    attr: function(emit, o) {
      emit('transform', translateItem(o));
      emit('d', path.arc(o));
    }
  },
  area: {
    tag:  'path',
    type: 'area',
    nest: true,
    attr: function(emit, o) {
      var items = o.mark.items;
      if (items.length) emit('d', path.area(items));
    }
  },
  group: {
    tag:  'g',
    type: 'group',
    attr: function(emit, o, renderer) {
      var id = null, defs, c;
      emit('transform', translateItem(o));
      if (o.clip) {
        defs = renderer._defs;
        id = o.clip_id || (o.clip_id = 'clip' + defs.clip_id++);
        c = defs.clipping[id] || (defs.clipping[id] = {id: id});
        c.width = o.width || 0;
        c.height = o.height || 0;
      }
      emit('clip-path', id ? ('url(#' + id + ')') : null);
    },
    background: function(emit, o) {
      emit('class', 'background');
      emit('width', o.width || 0);
      emit('height', o.height || 0);
    }
  },
  image: {
    tag:  'image',
    type: 'image',
    attr: function(emit, o, renderer) {
      var x = o.x || 0,
          y = o.y || 0,
          w = o.width || 0,
          h = o.height || 0,
          url = renderer.imageURL(o.url);

      x = x - (o.align === 'center' ? w/2 : o.align === 'right' ? w : 0);
      y = y - (o.baseline === 'middle' ? h/2 : o.baseline === 'bottom' ? h : 0);

      emit('href', url, 'http://www.w3.org/1999/xlink', 'xlink:href');
      emit('transform', translate(x, y));
      emit('width', w);
      emit('height', h);
    }
  },
  line: {
    tag:  'path',
    type: 'line',
    nest: true,
    attr: function(emit, o) {
      var items = o.mark.items;
      if (items.length) emit('d', path.line(items));
    }
  },
  path: {
    tag:  'path',
    type: 'path',
    attr: function(emit, o) {
      emit('transform', translateItem(o));
      emit('d', o.path);
    }
  },
  rect: {
    tag:  'rect',
    type: 'rect',
    nest: false,
    attr: function(emit, o) {
      emit('transform', translateItem(o));
      emit('width', o.width || 0);
      emit('height', o.height || 0);
    }
  },
  rule: {
    tag:  'line',
    type: 'rule',
    attr: function(emit, o) {
      emit('transform', translateItem(o));
      emit('x2', o.x2 != null ? o.x2 - (o.x||0) : 0);
      emit('y2', o.y2 != null ? o.y2 - (o.y||0) : 0);
    }
  },
  symbol: {
    tag:  'path',
    type: 'symbol',
    attr: function(emit, o) {
      var pathStr = !o.shape || symbolTypes[o.shape] ?
        path.symbol(o) : path.resize(o.shape, o.size);

      emit('transform', translateItem(o));
      emit('d', pathStr);
    }
  },
  text: {
    tag:  'text',
    type: 'text',
    nest: false,
    attr: function(emit, o) {
      var dx = (o.dx || 0),
          dy = (o.dy || 0) + text.offset(o),
          x = (o.x || 0),
          y = (o.y || 0),
          a = o.angle || 0,
          r = o.radius || 0, t;

      if (r) {
        t = (o.theta || 0) - Math.PI/2;
        x += r * Math.cos(t);
        y += r * Math.sin(t);
      }

      emit('text-anchor', textAlign[o.align] || 'start');

      if (a) {
        t = translate(x, y) + ' rotate('+a+')';
        if (dx || dy) t += ' ' + translate(dx, dy);
      } else {
        t = translate(x+dx, y+dy);
      }
      emit('transform', t);
    }
  }
};


/***/ }),

/***/ "rnWk":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    df = __webpack_require__("Hqva"),
    scene = __webpack_require__("LHV8"),
    Node = df.Node, // jshint ignore:line
    log = __webpack_require__("J731"),
    bound = scene.bound,
    Bounds = scene.Bounds,
    Encoder = __webpack_require__("XVii");

function Bounder(graph, mark) {
  this._mark = mark;
  return Node.prototype.init.call(this, graph)
    .router(true)
    .reflows(true)
    .mutates(true);
}

var proto = (Bounder.prototype = new Node());

proto.evaluate = function(input) {
  log.debug(input, ['bounds', this._mark.marktype]);

  var mark  = this._mark,
      type  = mark.marktype,
      isGrp = type === 'group',
      items = mark.items,
      hasLegends = dl.array(mark.def.legends).length > 0,
      bounds  = mark.bounds,
      rebound = !bounds || input.rem.length,
      i, ilen, j, jlen, group, legend;

  if (type === 'line' || type === 'area') {
    bound.mark(mark, null, isGrp && !hasLegends);
  } else {
    input.add.forEach(function(item) {
      bound.item(item);
      rebound = rebound || (bounds && !bounds.encloses(item.bounds));
    });

    input.mod.forEach(function(item) {
      rebound = rebound || (bounds && bounds.alignsWith(item.bounds));
      bound.item(item);
    });

    if (rebound) {
      bounds = mark.bounds && mark.bounds.clear() || (mark.bounds = new Bounds());
      for (i=0, ilen=items.length; i<ilen; ++i) bounds.union(items[i].bounds);
    }
  }

  if (isGrp && hasLegends) {
    for (i=0, ilen=items.length; i<ilen; ++i) {
      group = items[i];
      group._legendPositions = null;
      for (j=0, jlen=group.legendItems.length; j<jlen; ++j) {
        legend = group.legendItems[j];
        Encoder.update(this._graph, input.trans, 'legendPosition', legend.items, input.dirty);
        bound.mark(legend, null, false);
      }
    }

    bound.mark(mark, null, true);
  }

  return df.ChangeSet.create(input, true);
};

module.exports = Bounder;


/***/ }),

/***/ "sV93":
/***/ (function(module, exports) {

// create a new DOM element
function create(doc, tag, ns) {
  return ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);
}

// remove element from DOM
// recursively remove parent elements if empty
function remove(el) {
  if (!el) return;
  var p = el.parentNode;
  if (p) {
    p.removeChild(el);
    if (!p.childNodes || !p.childNodes.length) remove(p);
  }
}

module.exports = {
  // find first child element with matching tag
  find: function(el, tag) {
    tag = tag.toLowerCase();
    for (var i=0, n=el.childNodes.length; i<n; ++i) {
      if (el.childNodes[i].tagName.toLowerCase() === tag) {
        return el.childNodes[i];
      }
    }
  },
  // retrieve child element at given index
  // create & insert if doesn't exist or if tag/className do not match
  child: function(el, index, tag, ns, className, insert) {
    var a, b;
    a = b = el.childNodes[index];
    if (!a || insert ||
        a.tagName.toLowerCase() !== tag.toLowerCase() ||
        className && a.getAttribute('class') != className) {
      a = create(el.ownerDocument, tag, ns);
      el.insertBefore(a, b || null);
      if (className) a.setAttribute('class', className);
    }
    return a;
  },
  // remove all child elements at or above the given index
  clear: function(el, index) {
    var curr = el.childNodes.length;
    while (curr > index) {
      el.removeChild(el.childNodes[--curr]);
    }
    return el;
  },
  remove: remove,
  // generate css class name for mark
  cssClass: function(mark) {
    return 'mark-' + mark.marktype + (mark.name ? ' '+mark.name : '');
  },
  // generate string for an opening xml tag
  // tag: the name of the xml tag
  // attr: hash of attribute name-value pairs to include
  // raw: additional raw string to include in tag markup
  openTag: function(tag, attr, raw) {
    var s = '<' + tag, key, val;
    if (attr) {
      for (key in attr) {
        val = attr[key];
        if (val != null) {
          s += ' ' + key + '="' + val + '"';
        }
      }
    }
    if (raw) s += ' ' + raw;
    return s + '>';
  },
  // generate string for closing xml tag
  // tag: the name of the xml tag
  closeTag: function(tag) {
    return '</' + tag + '>';
  }
};


/***/ }),

/***/ "snBf":
/***/ (function(module, exports, __webpack_require__) {

var d3 = __webpack_require__("Za4h"),
    dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Geo = __webpack_require__("ct8e"),
    Transform = __webpack_require__("4JPs");

function GeoPath(graph) {
  Transform.prototype.init.call(this, graph);
  Transform.addParameters(this, Geo.Parameters);
  Transform.addParameters(this, {
    field: {type: 'field', default: null},
  });

  this._output = {
    'path': 'layout_path'
  };
  return this.mutates(true);
}

var prototype = (GeoPath.prototype = Object.create(Transform.prototype));
prototype.constructor = GeoPath;

prototype.transform = function(input) {
  log.debug(input, ['geopath']);

  var output = this._output,
      geojson = this.param('field').accessor || dl.identity,
      proj = Geo.d3Projection.call(this),
      path = d3.geo.path().projection(proj);

  function set(t) {
    Tuple.set(t, output.path, path(geojson(t)));
  }

  input.add.forEach(set);
  if (this.reevaluate(input)) {
    input.mod.forEach(set);
    input.rem.forEach(set);
  }

  input.fields[output.path] = 1;
  return input;
};

module.exports = GeoPath;

GeoPath.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "GeoPath transform",
  "description": "Creates paths for geographic regions, such as countries, states and counties.",
  "type": "object",
  "properties": dl.extend({
    "type": {"enum": ["geopath"]},
    "field": {
      "description": "The data field containing GeoJSON Feature data.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "path": {"type": "string", "default": "layout_path"}
      },
      "additionalProperties": false
    }
  }, Geo.baseSchema),
  "required": ["type"],
  "additionalProperties": false
};

/***/ }),

/***/ "t3C9":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var DEFAULT_NULL_FILTERS = {
    nominal: false,
    ordinal: false,
    quantitative: true,
    temporal: true
};
var nullFilter;
(function (nullFilter) {
    function parse(model) {
        var filterNull = model.transform().filterNull;
        return model.reduce(function (aggregator, fieldDef) {
            if (filterNull ||
                (filterNull === undefined && fieldDef.field && fieldDef.field !== '*' && DEFAULT_NULL_FILTERS[fieldDef.type])) {
                aggregator[fieldDef.field] = true;
            }
            else {
                aggregator[fieldDef.field] = false;
            }
            return aggregator;
        }, {});
    }
    nullFilter.parseUnit = parse;
    function parseFacet(model) {
        var nullFilterComponent = parse(model);
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            util_1.extend(nullFilterComponent, childDataComponent.nullFilter);
            delete childDataComponent.nullFilter;
        }
        return nullFilterComponent;
    }
    nullFilter.parseFacet = parseFacet;
    function parseLayer(model) {
        var nullFilterComponent = parse(model);
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (model.compatibleSource(child) && !util_1.differ(childDataComponent.nullFilter, nullFilterComponent)) {
                util_1.extend(nullFilterComponent, childDataComponent.nullFilter);
                delete childDataComponent.nullFilter;
            }
        });
        return nullFilterComponent;
    }
    nullFilter.parseLayer = parseLayer;
    function assemble(component) {
        var filteredFields = util_1.keys(component.nullFilter).filter(function (field) {
            return component.nullFilter[field];
        });
        return filteredFields.length > 0 ?
            [{
                    type: 'filter',
                    test: filteredFields.map(function (fieldName) {
                        return '(datum.' + fieldName + '!==null' +
                            ' && !isNaN(datum.' + fieldName + '))';
                    }).join(' && ')
                }] : [];
    }
    nullFilter.assemble = assemble;
})(nullFilter = exports.nullFilter || (exports.nullFilter = {}));
//# sourceMappingURL=nullfilter.js.map

/***/ }),

/***/ "tGq9":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    Measures = __webpack_require__("2I0S"),
    Collector = __webpack_require__("/2vj");

function Aggregator() {
  this._cells = {};
  this._aggr = [];
  this._stream = false;
}

var Flags = Aggregator.Flags = {
  ADD_CELL: 1,
  MOD_CELL: 2
};

var proto = Aggregator.prototype;

// Parameters

proto.stream = function(v) {
  if (v == null) return this._stream;
  this._stream = !!v;
  this._aggr = [];
  return this;
};

// key accessor to use for streaming removes
proto.key = function(key) {
  if (key == null) return this._key;
  this._key = util.$(key);
  return this;
};

// Input: array of objects of the form
// {name: string, get: function}
proto.groupby = function(dims) {
  this._dims = util.array(dims).map(function(d, i) {
    d = util.isString(d) ? {name: d, get: util.$(d)}
      : util.isFunction(d) ? {name: util.name(d) || d.name || ('_' + i), get: d}
      : (d.name && util.isFunction(d.get)) ? d : null;
    if (d == null) throw 'Invalid groupby argument: ' + d;
    return d;
  });
  return this.clear();
};

// Input: array of objects of the form
// {name: string, ops: [string, ...]}
proto.summarize = function(fields) {
  fields = summarize_args(fields);
  this._count = true;
  var aggr = (this._aggr = []),
      m, f, i, j, op, as, get;

  for (i=0; i<fields.length; ++i) {
    for (j=0, m=[], f=fields[i]; j<f.ops.length; ++j) {
      op = f.ops[j];
      if (op !== 'count') this._count = false;
      as = (f.as && f.as[j]) || (op + (f.name==='*' ? '' : '_'+f.name));
      m.push(Measures[op](as));
    }
    get = f.get && util.$(f.get) ||
      (f.name === '*' ? util.identity : util.$(f.name));
    aggr.push({
      name: f.name,
      measures: Measures.create(
        m,
        this._stream, // streaming remove flag
        get,          // input tuple getter
        this._assign) // output tuple setter
    });
  }
  return this.clear();
};

// Convenience method to summarize by count
proto.count = function() {
  return this.summarize({'*':'count'});
};

// Override to perform custom tuple value assignment
proto._assign = function(object, name, value) {
  object[name] = value;
};

function summarize_args(fields) {
  if (util.isArray(fields)) { return fields; }
  if (fields == null) { return []; }
  var a = [], name, ops;
  for (name in fields) {
    ops = util.array(fields[name]);
    a.push({name: name, ops: ops});
  }
  return a;
}

// Cell Management

proto.clear = function() {
  return (this._cells = {}, this);
};

proto._cellkey = function(x) {
  var d = this._dims,
      n = d.length, i,
      k = String(d[0].get(x));
  for (i=1; i<n; ++i) {
    k += '|' + d[i].get(x);
  }
  return k;
};

proto._cell = function(x) {
  var key = this._dims.length ? this._cellkey(x) : '';
  return this._cells[key] || (this._cells[key] = this._newcell(x, key));
};

proto._newcell = function(x, key) {
  var cell = {
    num:   0,
    tuple: this._newtuple(x, key),
    flag:  Flags.ADD_CELL,
    aggs:  {}
  };

  var aggr = this._aggr, i;
  for (i=0; i<aggr.length; ++i) {
    cell.aggs[aggr[i].name] = new aggr[i].measures(cell, cell.tuple);
  }
  if (cell.collect) {
    cell.data = new Collector(this._key);
  }
  return cell;
};

proto._newtuple = function(x) {
  var dims = this._dims,
      t = {}, i, n;
  for (i=0, n=dims.length; i<n; ++i) {
    t[dims[i].name] = dims[i].get(x);
  }
  return this._ingest(t);
};

// Override to perform custom tuple ingestion
proto._ingest = util.identity;

// Process Tuples

proto._add = function(x) {
  var cell = this._cell(x),
      aggr = this._aggr, i;

  cell.num += 1;
  if (!this._count) { // skip if count-only
    if (cell.collect) cell.data.add(x);
    for (i=0; i<aggr.length; ++i) {
      cell.aggs[aggr[i].name].add(x);
    }
  }
  cell.flag |= Flags.MOD_CELL;
  if (this._on_add) this._on_add(x, cell);
};

proto._rem = function(x) {
  var cell = this._cell(x),
      aggr = this._aggr, i;

  cell.num -= 1;
  if (!this._count) { // skip if count-only
    if (cell.collect) cell.data.rem(x);
    for (i=0; i<aggr.length; ++i) {
      cell.aggs[aggr[i].name].rem(x);
    }
  }
  cell.flag |= Flags.MOD_CELL;
  if (this._on_rem) this._on_rem(x, cell);
};

proto._mod = function(curr, prev) {
  var cell0 = this._cell(prev),
      cell1 = this._cell(curr),
      aggr = this._aggr, i;

  if (cell0 !== cell1) {
    cell0.num -= 1;
    cell1.num += 1;
    if (cell0.collect) cell0.data.rem(prev);
    if (cell1.collect) cell1.data.add(curr);
  } else if (cell0.collect && !util.isObject(curr)) {
    cell0.data.rem(prev);
    cell0.data.add(curr);
  }

  for (i=0; i<aggr.length; ++i) {
    cell0.aggs[aggr[i].name].rem(prev);
    cell1.aggs[aggr[i].name].add(curr);
  }
  cell0.flag |= Flags.MOD_CELL;
  cell1.flag |= Flags.MOD_CELL;
  if (this._on_mod) this._on_mod(curr, prev, cell0, cell1);
};

proto._markMod = function(x) {
  var cell0 = this._cell(x);
  cell0.flag |= Flags.MOD_CELL;
};

proto.result = function() {
  var result = [],
      aggr = this._aggr,
      cell, i, k;

  for (k in this._cells) {
    cell = this._cells[k];
    if (cell.num > 0) {
      // consolidate collector values
      if (cell.collect) {
        cell.data.values();
      }
      // update tuple properties
      for (i=0; i<aggr.length; ++i) {
        cell.aggs[aggr[i].name].set();
      }
      // add output tuple
      result.push(cell.tuple);
    } else {
      delete this._cells[k];
    }
    cell.flag = 0;
  }

  this._rems = false;
  return result;
};

proto.changes = function(output) {
  var changes = output || {add:[], rem:[], mod:[]},
      aggr = this._aggr,
      cell, flag, i, k;

  for (k in this._cells) {
    cell = this._cells[k];
    flag = cell.flag;

    // consolidate collector values
    if (cell.collect) {
      cell.data.values();
    }

    // update tuple properties
    for (i=0; i<aggr.length; ++i) {
      cell.aggs[aggr[i].name].set();
    }

    // organize output tuples
    if (cell.num <= 0) {
      changes.rem.push(cell.tuple); // if (flag === Flags.MOD_CELL) { ??
      delete this._cells[k];
      if (this._on_drop) this._on_drop(cell);
    } else {
      if (this._on_keep) this._on_keep(cell);
      if (flag & Flags.ADD_CELL) {
        changes.add.push(cell.tuple);
      } else if (flag & Flags.MOD_CELL) {
        changes.mod.push(cell.tuple);
      }
    }

    cell.flag = 0;
  }

  this._rems = false;
  return changes;
};

proto.execute = function(input) {
  return this.clear().insert(input).result();
};

proto.insert = function(input) {
  this._consolidate();
  for (var i=0; i<input.length; ++i) {
    this._add(input[i]);
  }
  return this;
};

proto.remove = function(input) {
  if (!this._stream) {
    throw 'Aggregator not configured for streaming removes.' +
      ' Call stream(true) prior to calling summarize.';
  }
  for (var i=0; i<input.length; ++i) {
    this._rem(input[i]);
  }
  this._rems = true;
  return this;
};

// consolidate removals
proto._consolidate = function() {
  if (!this._rems) return;
  for (var k in this._cells) {
    if (this._cells[k].collect) {
      this._cells[k].data.values();
    }
  }
  this._rems = false;
};

module.exports = Aggregator;


/***/ }),

/***/ "uHQN":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");
var type = __webpack_require__("ggRp");
var gen = __webpack_require__("YsQl");

var stats = module.exports;

// Collect unique values.
// Output: an array of unique values, in first-observed order
stats.unique = function(values, f, results) {
  f = util.$(f);
  results = results || [];
  var u = {}, v, i, n;
  for (i=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (v in u) continue;
    u[v] = 1;
    results.push(v);
  }
  return results;
};

// Return the length of the input array.
stats.count = function(values) {
  return values && values.length || 0;
};

// Count the number of non-null, non-undefined, non-NaN values.
stats.count.valid = function(values, f) {
  f = util.$(f);
  var v, i, n, valid = 0;
  for (i=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) valid += 1;
  }
  return valid;
};

// Count the number of null or undefined values.
stats.count.missing = function(values, f) {
  f = util.$(f);
  var v, i, n, count = 0;
  for (i=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (v == null) count += 1;
  }
  return count;
};

// Count the number of distinct values.
// Null, undefined and NaN are each considered distinct values.
stats.count.distinct = function(values, f) {
  f = util.$(f);
  var u = {}, v, i, n, count = 0;
  for (i=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (v in u) continue;
    u[v] = 1;
    count += 1;
  }
  return count;
};

// Construct a map from distinct values to occurrence counts.
stats.count.map = function(values, f) {
  f = util.$(f);
  var map = {}, v, i, n;
  for (i=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    map[v] = (v in map) ? map[v] + 1 : 1;
  }
  return map;
};

// Compute the median of an array of numbers.
stats.median = function(values, f) {
  if (f) values = values.map(util.$(f));
  values = values.filter(util.isValid).sort(util.cmp);
  return stats.quantile(values, 0.5);
};

// Computes the quartile boundaries of an array of numbers.
stats.quartile = function(values, f) {
  if (f) values = values.map(util.$(f));
  values = values.filter(util.isValid).sort(util.cmp);
  var q = stats.quantile;
  return [q(values, 0.25), q(values, 0.50), q(values, 0.75)];
};

// Compute the quantile of a sorted array of numbers.
// Adapted from the D3.js implementation.
stats.quantile = function(values, f, p) {
  if (p === undefined) { p = f; f = util.identity; }
  f = util.$(f);
  var H = (values.length - 1) * p + 1,
      h = Math.floor(H),
      v = +f(values[h - 1]),
      e = H - h;
  return e ? v + e * (f(values[h]) - v) : v;
};

// Compute the sum of an array of numbers.
stats.sum = function(values, f) {
  f = util.$(f);
  for (var sum=0, i=0, n=values.length, v; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) sum += v;
  }
  return sum;
};

// Compute the mean (average) of an array of numbers.
stats.mean = function(values, f) {
  f = util.$(f);
  var mean = 0, delta, i, n, c, v;
  for (i=0, c=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      delta = v - mean;
      mean = mean + delta / (++c);
    }
  }
  return mean;
};

// Compute the geometric mean of an array of numbers.
stats.mean.geometric = function(values, f) {
  f = util.$(f);
  var mean = 1, c, n, v, i;
  for (i=0, c=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      if (v <= 0) {
        throw Error("Geometric mean only defined for positive values.");
      }
      mean *= v;
      ++c;
    }
  }
  mean = c > 0 ? Math.pow(mean, 1/c) : 0;
  return mean;
};

// Compute the harmonic mean of an array of numbers.
stats.mean.harmonic = function(values, f) {
  f = util.$(f);
  var mean = 0, c, n, v, i;
  for (i=0, c=0, n=values.length; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      mean += 1/v;
      ++c;
    }
  }
  return c / mean;
};

// Compute the sample variance of an array of numbers.
stats.variance = function(values, f) {
  f = util.$(f);
  if (!util.isArray(values) || values.length < 2) return 0;
  var mean = 0, M2 = 0, delta, i, c, v;
  for (i=0, c=0; i<values.length; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      delta = v - mean;
      mean = mean + delta / (++c);
      M2 = M2 + delta * (v - mean);
    }
  }
  M2 = M2 / (c - 1);
  return M2;
};

// Compute the sample standard deviation of an array of numbers.
stats.stdev = function(values, f) {
  return Math.sqrt(stats.variance(values, f));
};

// Compute the Pearson mode skewness ((median-mean)/stdev) of an array of numbers.
stats.modeskew = function(values, f) {
  var avg = stats.mean(values, f),
      med = stats.median(values, f),
      std = stats.stdev(values, f);
  return std === 0 ? 0 : (avg - med) / std;
};

// Find the minimum value in an array.
stats.min = function(values, f) {
  return stats.extent(values, f)[0];
};

// Find the maximum value in an array.
stats.max = function(values, f) {
  return stats.extent(values, f)[1];
};

// Find the minimum and maximum of an array of values.
stats.extent = function(values, f) {
  f = util.$(f);
  var a, b, v, i, n = values.length;
  for (i=0; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) { a = b = v; break; }
  }
  for (; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      if (v < a) a = v;
      if (v > b) b = v;
    }
  }
  return [a, b];
};

// Find the integer indices of the minimum and maximum values.
stats.extent.index = function(values, f) {
  f = util.$(f);
  var x = -1, y = -1, a, b, v, i, n = values.length;
  for (i=0; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) { a = b = v; x = y = i; break; }
  }
  for (; i<n; ++i) {
    v = f ? f(values[i]) : values[i];
    if (util.isValid(v)) {
      if (v < a) { a = v; x = i; }
      if (v > b) { b = v; y = i; }
    }
  }
  return [x, y];
};

// Compute the dot product of two arrays of numbers.
stats.dot = function(values, a, b) {
  var sum = 0, i, v;
  if (!b) {
    if (values.length !== a.length) {
      throw Error('Array lengths must match.');
    }
    for (i=0; i<values.length; ++i) {
      v = values[i] * a[i];
      if (v === v) sum += v;
    }
  } else {
    a = util.$(a);
    b = util.$(b);
    for (i=0; i<values.length; ++i) {
      v = a(values[i]) * b(values[i]);
      if (v === v) sum += v;
    }
  }
  return sum;
};

// Compute the vector distance between two arrays of numbers.
// Default is Euclidean (exp=2) distance, configurable via exp argument.
stats.dist = function(values, a, b, exp) {
  var f = util.isFunction(b) || util.isString(b),
      X = values,
      Y = f ? values : a,
      e = f ? exp : b,
      L2 = e === 2 || e == null,
      n = values.length, s = 0, d, i;
  if (f) {
    a = util.$(a);
    b = util.$(b);
  }
  for (i=0; i<n; ++i) {
    d = f ? (a(X[i])-b(Y[i])) : (X[i]-Y[i]);
    s += L2 ? d*d : Math.pow(Math.abs(d), e);
  }
  return L2 ? Math.sqrt(s) : Math.pow(s, 1/e);
};

// Compute the Cohen's d effect size between two arrays of numbers.
stats.cohensd = function(values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a,
      x1 = stats.mean(X),
      x2 = stats.mean(Y),
      n1 = stats.count.valid(X),
      n2 = stats.count.valid(Y);

  if ((n1+n2-2) <= 0) {
    // if both arrays are size 1, or one is empty, there's no effect size
    return 0;
  }
  // pool standard deviation
  var s1 = stats.variance(X),
      s2 = stats.variance(Y),
      s = Math.sqrt((((n1-1)*s1) + ((n2-1)*s2)) / (n1+n2-2));
  // if there is no variance, there's no effect size
  return s===0 ? 0 : (x1 - x2) / s;
};

// Computes the covariance between two arrays of numbers
stats.covariance = function(values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a,
      n = X.length,
      xm = stats.mean(X),
      ym = stats.mean(Y),
      sum = 0, c = 0, i, x, y, vx, vy;

  if (n !== Y.length) {
    throw Error('Input lengths must match.');
  }

  for (i=0; i<n; ++i) {
    x = X[i]; vx = util.isValid(x);
    y = Y[i]; vy = util.isValid(y);
    if (vx && vy) {
      sum += (x-xm) * (y-ym);
      ++c;
    } else if (vx || vy) {
      throw Error('Valid values must align.');
    }
  }
  return sum / (c-1);
};

// Compute ascending rank scores for an array of values.
// Ties are assigned their collective mean rank.
stats.rank = function(values, f) {
  f = util.$(f) || util.identity;
  var a = values.map(function(v, i) {
      return {idx: i, val: f(v)};
    })
    .sort(util.comparator('val'));

  var n = values.length,
      r = Array(n),
      tie = -1, p = {}, i, v, mu;

  for (i=0; i<n; ++i) {
    v = a[i].val;
    if (tie < 0 && p === v) {
      tie = i - 1;
    } else if (tie > -1 && p !== v) {
      mu = 1 + (i-1 + tie) / 2;
      for (; tie<i; ++tie) r[a[tie].idx] = mu;
      tie = -1;
    }
    r[a[i].idx] = i + 1;
    p = v;
  }

  if (tie > -1) {
    mu = 1 + (n-1 + tie) / 2;
    for (; tie<n; ++tie) r[a[tie].idx] = mu;
  }

  return r;
};

// Compute the sample Pearson product-moment correlation of two arrays of numbers.
stats.cor = function(values, a, b) {
  var fn = b;
  b = fn ? values.map(util.$(b)) : a;
  a = fn ? values.map(util.$(a)) : values;

  var dot = stats.dot(a, b),
      mua = stats.mean(a),
      mub = stats.mean(b),
      sda = stats.stdev(a),
      sdb = stats.stdev(b),
      n = values.length;

  return (dot - n*mua*mub) / ((n-1) * sda * sdb);
};

// Compute the Spearman rank correlation of two arrays of values.
stats.cor.rank = function(values, a, b) {
  var ra = b ? stats.rank(values, a) : stats.rank(values),
      rb = b ? stats.rank(values, b) : stats.rank(a),
      n = values.length, i, s, d;

  for (i=0, s=0; i<n; ++i) {
    d = ra[i] - rb[i];
    s += d * d;
  }

  return 1 - 6*s / (n * (n*n-1));
};

// Compute the distance correlation of two arrays of numbers.
// http://en.wikipedia.org/wiki/Distance_correlation
stats.cor.dist = function(values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a;

  var A = stats.dist.mat(X),
      B = stats.dist.mat(Y),
      n = A.length,
      i, aa, bb, ab;

  for (i=0, aa=0, bb=0, ab=0; i<n; ++i) {
    aa += A[i]*A[i];
    bb += B[i]*B[i];
    ab += A[i]*B[i];
  }

  return Math.sqrt(ab / Math.sqrt(aa*bb));
};

// Simple linear regression.
// Returns a "fit" object with slope (m), intercept (b),
// r value (R), and sum-squared residual error (rss).
stats.linearRegression = function(values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a,
      n = X.length,
      xy = stats.covariance(X, Y), // will throw err if valid vals don't align
      sx = stats.stdev(X),
      sy = stats.stdev(Y),
      slope = xy / (sx*sx),
      icept = stats.mean(Y) - slope * stats.mean(X),
      fit = {slope: slope, intercept: icept, R: xy / (sx*sy), rss: 0},
      res, i;

  for (i=0; i<n; ++i) {
    if (util.isValid(X[i]) && util.isValid(Y[i])) {
      res = (slope*X[i] + icept) - Y[i];
      fit.rss += res * res;
    }
  }

  return fit;
};

// Namespace for bootstrap
stats.bootstrap = {};

// Construct a bootstrapped confidence interval at a given percentile level
// Arguments are an array, an optional n (defaults to 1000),
//  an optional alpha (defaults to 0.05), and an optional smoothing parameter
stats.bootstrap.ci = function(values, a, b, c, d) {
  var X, N, alpha, smooth, bs, means, i;
  if (util.isFunction(a) || util.isString(a)) {
    X = values.map(util.$(a));
    N = b;
    alpha = c;
    smooth = d;
  } else {
    X = values;
    N = a;
    alpha = b;
    smooth = c;
  }
  N = N ? +N : 1000;
  alpha = alpha || 0.05;

  bs = gen.random.bootstrap(X, smooth);
  for (i=0, means = Array(N); i<N; ++i) {
    means[i] = stats.mean(bs.samples(X.length));
  }
  means.sort(util.numcmp);
  return [
    stats.quantile(means, alpha/2),
    stats.quantile(means, 1-(alpha/2))
  ];
};

// Namespace for z-tests
stats.z = {};

// Construct a z-confidence interval at a given significance level
// Arguments are an array and an optional alpha (defaults to 0.05).
stats.z.ci = function(values, a, b) {
  var X = values, alpha = a;
  if (util.isFunction(a) || util.isString(a)) {
    X = values.map(util.$(a));
    alpha = b;
  }
  alpha = alpha || 0.05;

  var z = alpha===0.05 ? 1.96 : gen.random.normal(0, 1).icdf(1-(alpha/2)),
      mu = stats.mean(X),
      SE = stats.stdev(X) / Math.sqrt(stats.count.valid(X));
  return [mu - (z*SE), mu + (z*SE)];
};

// Perform a z-test of means. Returns the p-value.
// If a single array is provided, performs a one-sample location test.
// If two arrays or a table and two accessors are provided, performs
// a two-sample location test. A paired test is performed if specified
// by the options hash.
// The options hash format is: {paired: boolean, nullh: number}.
// http://en.wikipedia.org/wiki/Z-test
// http://en.wikipedia.org/wiki/Paired_difference_test
stats.z.test = function(values, a, b, opt) {
  if (util.isFunction(b) || util.isString(b)) { // table and accessors
    return (opt && opt.paired ? ztestP : ztest2)(opt, values, a, b);
  } else if (util.isArray(a)) { // two arrays
    return (b && b.paired ? ztestP : ztest2)(b, values, a);
  } else if (util.isFunction(a) || util.isString(a)) {
    return ztest1(b, values, a); // table and accessor
  } else {
    return ztest1(a, values); // one array
  }
};

// Perform a z-test of means. Returns the p-value.
// Assuming we have a list of values, and a null hypothesis. If no null
// hypothesis, assume our null hypothesis is mu=0.
function ztest1(opt, X, f) {
  var nullH = opt && opt.nullh || 0,
      gaussian = gen.random.normal(0, 1),
      mu = stats.mean(X,f),
      SE = stats.stdev(X,f) / Math.sqrt(stats.count.valid(X,f));

  if (SE===0) {
    // Test not well defined when standard error is 0.
    return (mu - nullH) === 0 ? 1 : 0;
  }
  // Two-sided, so twice the one-sided cdf.
  var z = (mu - nullH) / SE;
  return 2 * gaussian.cdf(-Math.abs(z));
}

// Perform a two sample paired z-test of means. Returns the p-value.
function ztestP(opt, values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a,
      n1 = stats.count(X),
      n2 = stats.count(Y),
      diffs = Array(), i;

  if (n1 !== n2) {
    throw Error('Array lengths must match.');
  }
  for (i=0; i<n1; ++i) {
    // Only valid differences should contribute to the test statistic
    if (util.isValid(X[i]) && util.isValid(Y[i])) {
      diffs.push(X[i] - Y[i]);
    }
  }
  return stats.z.test(diffs, opt && opt.nullh || 0);
}

// Perform a two sample z-test of means. Returns the p-value.
function ztest2(opt, values, a, b) {
  var X = b ? values.map(util.$(a)) : values,
      Y = b ? values.map(util.$(b)) : a,
      n1 = stats.count.valid(X),
      n2 = stats.count.valid(Y),
      gaussian = gen.random.normal(0, 1),
      meanDiff = stats.mean(X) - stats.mean(Y) - (opt && opt.nullh || 0),
      SE = Math.sqrt(stats.variance(X)/n1 + stats.variance(Y)/n2);

  if (SE===0) {
    // Not well defined when pooled standard error is 0.
    return meanDiff===0 ? 1 : 0;
  }
  // Two-tailed, so twice the one-sided cdf.
  var z = meanDiff / SE;
  return 2 * gaussian.cdf(-Math.abs(z));
}

// Construct a mean-centered distance matrix for an array of numbers.
stats.dist.mat = function(X) {
  var n = X.length,
      m = n*n,
      A = Array(m),
      R = gen.zeros(n),
      M = 0, v, i, j;

  for (i=0; i<n; ++i) {
    A[i*n+i] = 0;
    for (j=i+1; j<n; ++j) {
      A[i*n+j] = (v = Math.abs(X[i] - X[j]));
      A[j*n+i] = v;
      R[i] += v;
      R[j] += v;
    }
  }

  for (i=0; i<n; ++i) {
    M += R[i];
    R[i] /= n;
  }
  M /= m;

  for (i=0; i<n; ++i) {
    for (j=i; j<n; ++j) {
      A[i*n+j] += M - R[i] - R[j];
      A[j*n+i] = A[i*n+j];
    }
  }

  return A;
};

// Compute the Shannon entropy (log base 2) of an array of counts.
stats.entropy = function(counts, f) {
  f = util.$(f);
  var i, p, s = 0, H = 0, n = counts.length;
  for (i=0; i<n; ++i) {
    s += (f ? f(counts[i]) : counts[i]);
  }
  if (s === 0) return 0;
  for (i=0; i<n; ++i) {
    p = (f ? f(counts[i]) : counts[i]) / s;
    if (p) H += p * Math.log(p);
  }
  return -H / Math.LN2;
};

// Compute the mutual information between two discrete variables.
// Returns an array of the form [MI, MI_distance]
// MI_distance is defined as 1 - I(a,b) / H(a,b).
// http://en.wikipedia.org/wiki/Mutual_information
stats.mutual = function(values, a, b, counts) {
  var x = counts ? values.map(util.$(a)) : values,
      y = counts ? values.map(util.$(b)) : a,
      z = counts ? values.map(util.$(counts)) : b;

  var px = {},
      py = {},
      n = z.length,
      s = 0, I = 0, H = 0, p, t, i;

  for (i=0; i<n; ++i) {
    px[x[i]] = 0;
    py[y[i]] = 0;
  }

  for (i=0; i<n; ++i) {
    px[x[i]] += z[i];
    py[y[i]] += z[i];
    s += z[i];
  }

  t = 1 / (s * Math.LN2);
  for (i=0; i<n; ++i) {
    if (z[i] === 0) continue;
    p = (s * z[i]) / (px[x[i]] * py[y[i]]);
    I += z[i] * t * Math.log(p);
    H += z[i] * t * Math.log(z[i]/s);
  }

  return [I, 1 + I/H];
};

// Compute the mutual information between two discrete variables.
stats.mutual.info = function(values, a, b, counts) {
  return stats.mutual(values, a, b, counts)[0];
};

// Compute the mutual information distance between two discrete variables.
// MI_distance is defined as 1 - I(a,b) / H(a,b).
stats.mutual.dist = function(values, a, b, counts) {
  return stats.mutual(values, a, b, counts)[1];
};

// Compute a profile of summary statistics for a variable.
stats.profile = function(values, f) {
  var mean = 0,
      valid = 0,
      missing = 0,
      distinct = 0,
      min = null,
      max = null,
      M2 = 0,
      vals = [],
      u = {}, delta, sd, i, v, x;

  // compute summary stats
  for (i=0; i<values.length; ++i) {
    v = f ? f(values[i]) : values[i];

    // update unique values
    u[v] = (v in u) ? u[v] + 1 : (distinct += 1, 1);

    if (v == null) {
      ++missing;
    } else if (util.isValid(v)) {
      // update stats
      x = (typeof v === 'string') ? v.length : v;
      if (min===null || x < min) min = x;
      if (max===null || x > max) max = x;
      delta = x - mean;
      mean = mean + delta / (++valid);
      M2 = M2 + delta * (x - mean);
      vals.push(x);
    }
  }
  M2 = M2 / (valid - 1);
  sd = Math.sqrt(M2);

  // sort values for median and iqr
  vals.sort(util.cmp);

  return {
    type:     type(values, f),
    unique:   u,
    count:    values.length,
    valid:    valid,
    missing:  missing,
    distinct: distinct,
    min:      min,
    max:      max,
    mean:     mean,
    stdev:    sd,
    median:   (v = stats.quantile(vals, 0.5)),
    q1:       stats.quantile(vals, 0.25),
    q3:       stats.quantile(vals, 0.75),
    modeskew: sd === 0 ? 0 : (mean - v) / sd
  };
};

// Compute profiles for all variables in a data set.
stats.summary = function(data, fields) {
  fields = fields || util.keys(data[0]);
  var s = fields.map(function(f) {
    var p = stats.profile(data, util.$(f));
    return (p.field = f, p);
  });
  return (s.__summary__ = true, s);
};


/***/ }),

/***/ "v0Fq":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    u  = {};

dl.extend(u, __webpack_require__("hv1v"));
module.exports = dl.extend(u, dl);

/***/ }),

/***/ "v4pi":
/***/ (function(module, exports, __webpack_require__) {

var lgnd = __webpack_require__("CXWl");

function parseLegends(model, spec, legends, group) {
  (spec || []).forEach(function(def, index) {
    legends[index] = legends[index] || lgnd(model);
    parseLegend(def, index, legends[index], group);
  });
}

function parseLegend(def, index, legend, group) {
  // legend scales
  legend.size   (def.size    ? group.scale(def.size)    : null);
  legend.shape  (def.shape   ? group.scale(def.shape)   : null);
  legend.fill   (def.fill    ? group.scale(def.fill)    : null);
  legend.stroke (def.stroke  ? group.scale(def.stroke)  : null);
  legend.opacity(def.opacity ? group.scale(def.opacity) : null);

  // legend orientation
  if (def.orient) legend.orient(def.orient);

  // legend offset
  if (def.offset != null) legend.offset(def.offset);

  // legend title
  legend.title(def.title || null);

  // legend values
  legend.values(def.values || null);

  // legend label formatting
  legend.format(def.format !== undefined ? def.format : null);
  legend.formatType(def.formatType || null);

  // style properties
  var p = def.properties;
  legend.titleProperties(p && p.title || {});
  legend.labelProperties(p && p.labels || {});
  legend.legendProperties(p && p.legend || {});
  legend.symbolProperties(p && p.symbols || {});
  legend.gradientProperties(p && p.gradient || {});
}

module.exports = parseLegends;

parseLegends.schema = {
  "defs": {
    "legend": {
      "type": "object",
      "properties": {
        "size": {"type": "string"},
        "shape": {"type": "string"},
        "fill": {"type": "string"},
        "stroke": {"type": "string"},
        "opacity": {"type": "string"},
        "orient": {"enum": ["left", "right"], "default": "right"},
        "offset": {"type": "number"},
        "title": {"type": "string"},
        "values": {"type": "array"},
        "format": {"type": "string"},
        "formatType": {"enum": ["time", "utc", "string", "number"]},
        "properties": {
          "type": "object",
          "properties": {
            "title": {"$ref": "#/defs/propset"},
            "labels": {"$ref": "#/defs/propset"},
            "legend": {"$ref": "#/defs/propset"},
            "symbols": {"$ref": "#/defs/propset"},
            "gradient": {"$ref": "#/defs/propset"}
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "anyOf": [
        {"required": ["size"]},
        {"required": ["shape"]},
        {"required": ["fill"]},
        {"required": ["stroke"]},
        {"required": ["opacity"]}
      ]
    }
  }
};


/***/ }),

/***/ "vA75":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

//# sourceMappingURL=facet.js.map

/***/ }),

/***/ "vY52":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var channel_1 = __webpack_require__("P/aK");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var colorRank;
(function (colorRank) {
    function parseUnit(model) {
        var colorRankComponent = {};
        if (model.has(channel_1.COLOR) && model.fieldDef(channel_1.COLOR).type === type_1.ORDINAL) {
            colorRankComponent[model.field(channel_1.COLOR)] = [{
                    type: 'sort',
                    by: model.field(channel_1.COLOR)
                }, {
                    type: 'rank',
                    field: model.field(channel_1.COLOR),
                    output: {
                        rank: model.field(channel_1.COLOR, { prefn: 'rank_' })
                    }
                }];
        }
        return colorRankComponent;
    }
    colorRank.parseUnit = parseUnit;
    function parseFacet(model) {
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            var colorRankComponent = childDataComponent.colorRank;
            delete childDataComponent.colorRank;
            return colorRankComponent;
        }
        return {};
    }
    colorRank.parseFacet = parseFacet;
    function parseLayer(model) {
        var colorRankComponent = {};
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (!childDataComponent.source) {
                util_1.extend(colorRankComponent, childDataComponent.colorRank);
                delete childDataComponent.colorRank;
            }
        });
        return colorRankComponent;
    }
    colorRank.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.flatten(util_1.vals(component.colorRank));
    }
    colorRank.assemble = assemble;
})(colorRank = exports.colorRank || (exports.colorRank = {}));
//# sourceMappingURL=colorrank.js.map

/***/ }),

/***/ "wKIX":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var util_1 = __webpack_require__("ZAUf");
var channel_1 = __webpack_require__("P/aK");
var timeunit_1 = __webpack_require__("z5TJ");
function smallestUnit(timeUnit) {
    if (!timeUnit) {
        return undefined;
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.SECONDS)) {
        return 'second';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.MINUTES)) {
        return 'minute';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.HOURS)) {
        return 'hour';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.DAY) ||
        timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.DATE)) {
        return 'day';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.MONTH)) {
        return 'month';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.YEAR)) {
        return 'year';
    }
    return undefined;
}
exports.smallestUnit = smallestUnit;
function parseExpression(timeUnit, fieldRef, onlyRef) {
    if (onlyRef === void 0) { onlyRef = false; }
    var out = 'datetime(';
    function func(fun, addComma) {
        if (addComma === void 0) { addComma = true; }
        if (onlyRef) {
            return fieldRef + (addComma ? ', ' : '');
        }
        else {
            var res = '';
            if (fun === 'quarter') {
                res = 'floor(month(' + fieldRef + ')' + '/3)*3';
            }
            else {
                res = fun + '(' + fieldRef + ')';
            }
            return res + (addComma ? ', ' : '');
        }
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.YEAR)) {
        out += func('year');
    }
    else {
        out += '2006, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.MONTH)) {
        out += func('month');
    }
    else if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.QUARTER)) {
        out += func('quarter');
    }
    else {
        out += '0, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.DAY)) {
        out += func('day', false) + '+1, ';
    }
    else if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.DATE)) {
        out += func('date');
    }
    else {
        out += '1, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.HOURS)) {
        out += func('hours');
    }
    else {
        out += '0, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.MINUTES)) {
        out += func('minutes');
    }
    else {
        out += '0, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.SECONDS)) {
        out += func('seconds');
    }
    else {
        out += '0, ';
    }
    if (timeunit_1.containsTimeUnit(timeUnit, timeunit_1.TimeUnit.MILLISECONDS)) {
        out += func('milliseconds', false);
    }
    else {
        out += '0';
    }
    return out + ')';
}
exports.parseExpression = parseExpression;
function rawDomain(timeUnit, channel) {
    if (util_1.contains([channel_1.ROW, channel_1.COLUMN, channel_1.SHAPE, channel_1.COLOR], channel)) {
        return null;
    }
    switch (timeUnit) {
        case timeunit_1.TimeUnit.SECONDS:
            return util_1.range(0, 60);
        case timeunit_1.TimeUnit.MINUTES:
            return util_1.range(0, 60);
        case timeunit_1.TimeUnit.HOURS:
            return util_1.range(0, 24);
        case timeunit_1.TimeUnit.DAY:
            return util_1.range(0, 7);
        case timeunit_1.TimeUnit.DATE:
            return util_1.range(1, 32);
        case timeunit_1.TimeUnit.MONTH:
            return util_1.range(0, 12);
        case timeunit_1.TimeUnit.QUARTER:
            return [0, 3, 6, 9];
    }
    return null;
}
exports.rawDomain = rawDomain;
//# sourceMappingURL=time.js.map

/***/ }),

/***/ "wLy+":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Stack(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    groupby: {type: 'array<field>'},
    sortby: {type: 'array<field>'},
    field: {type: 'field'},
    offset: {type: 'value', default: 'zero'}
  });

  this._output = {
    'start': 'layout_start',
    'end':   'layout_end',
    'mid':   'layout_mid'
  };
  return this.mutates(true);
}

var prototype = (Stack.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Stack;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['stacking']);

  var groupby = this.param('groupby').accessor,
      sortby = dl.comparator(this.param('sortby').field),
      field = this.param('field').accessor,
      offset = this.param('offset'),
      output = this._output;

  // partition, sum, and sort the stack groups
  var groups = partition(data, groupby, sortby, field);

  // compute stack layouts per group
  for (var i=0, max=groups.max; i<groups.length; ++i) {
    var group = groups[i],
        sum = group.sum,
        off = offset==='center' ? (max - sum)/2 : 0,
        scale = offset==='normalize' ? (1/sum) : 1,
        j, x, a, b = off, v = 0;

    // set stack coordinates for each datum in group
    for (j=0; j<group.length; ++j) {
      x = group[j];
      a = b; // use previous value for start point
      v += field(x);
      b = scale * v + off; // compute end point
      Tuple.set(x, output.start, a);
      Tuple.set(x, output.end, b);
      Tuple.set(x, output.mid, 0.5 * (a + b));
    }
  }

  input.fields[output.start] = 1;
  input.fields[output.end] = 1;
  input.fields[output.mid] = 1;
  return input;
};

function partition(data, groupby, sortby, field) {
  var groups = [],
      get = function(f) { return f(x); },
      map, i, x, k, g, s, max;

  // partition data points into stack groups
  if (groupby == null) {
    groups.push(data.slice());
  } else {
    for (map={}, i=0; i<data.length; ++i) {
      x = data[i];
      k = groupby.map(get);
      g = map[k] || (groups.push(map[k] = []), map[k]);
      g.push(x);
    }
  }

  // compute sums of groups, sort groups as needed
  for (k=0, max=0; k<groups.length; ++k) {
    g = groups[k];
    for (i=0, s=0; i<g.length; ++i) {
      s += field(g[i]);
    }
    g.sum = s;
    if (s > max) max = s;
    if (sortby != null) g.sort(sortby);
  }
  groups.max = max;

  return groups;
}

module.exports = Stack;

Stack.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Stack transform",
  "description": "Computes layout values for stacked graphs, as in stacked bar charts or stream graphs.",
  "type": "object",
  "properties": {
    "type": {"enum": ["stack"]},
    "groupby": {
      "description": "A list of fields to split the data into groups (stacks).",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],
    },
    "sortby": {
      "description": "A list of fields to determine the sort order of stacks.",
      "oneOf": [
        {
          "type": "array",
          "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
        },
        {"$ref": "#/refs/signal"}
      ],
    },
    "field": {
      "description": "The data field that determines the thickness/height of stacks.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "offset": {
      "description": "The baseline offset",
      "oneOf": [{"enum": ["zero", "center", "normalize"]}, {"$ref": "#/refs/signal"}],
      "default": "zero"
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "start": {"type": "string", "default": "layout_start"},
        "end": {"type": "string", "default": "layout_end"},
        "mid": {"type": "string", "default": "layout_mid"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type", "groupby", "field"]
};


/***/ }),

/***/ "wWYS":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

exports.axis = __webpack_require__("cihr");
exports.aggregate = __webpack_require__("h/tW");
exports.bin = __webpack_require__("FmT5");
exports.channel = __webpack_require__("P/aK");
exports.compile = __webpack_require__("z/Ym").compile;
exports.config = __webpack_require__("Py5Z");
exports.data = __webpack_require__("x6Fv");
exports.encoding = __webpack_require__("QSMf");
exports.facet = __webpack_require__("vA75");
exports.fieldDef = __webpack_require__("o+e1");
exports.legend = __webpack_require__("ZE31");
exports.mark = __webpack_require__("j8cM");
exports.scale = __webpack_require__("Fw/k");
exports.shorthand = __webpack_require__("/7Ur");
exports.sort = __webpack_require__("yLwJ");
exports.spec = __webpack_require__("F9eC");
exports.stack = __webpack_require__("f2i1");
exports.timeUnit = __webpack_require__("z5TJ");
exports.transform = __webpack_require__("iIpz");
exports.type = __webpack_require__("WJ2w");
exports.util = __webpack_require__("ZAUf");
exports.validate = __webpack_require__("Utn/");
exports.version = '__VERSION__';
//# sourceMappingURL=vl.js.map

/***/ }),

/***/ "x6Fv":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var type_1 = __webpack_require__("WJ2w");
(function (DataFormatType) {
    DataFormatType[DataFormatType["JSON"] = 'json'] = "JSON";
    DataFormatType[DataFormatType["CSV"] = 'csv'] = "CSV";
    DataFormatType[DataFormatType["TSV"] = 'tsv'] = "TSV";
    DataFormatType[DataFormatType["TOPOJSON"] = 'topojson'] = "TOPOJSON";
})(exports.DataFormatType || (exports.DataFormatType = {}));
var DataFormatType = exports.DataFormatType;
(function (DataTable) {
    DataTable[DataTable["SOURCE"] = 'source'] = "SOURCE";
    DataTable[DataTable["SUMMARY"] = 'summary'] = "SUMMARY";
    DataTable[DataTable["STACKED_SCALE"] = 'stacked_scale'] = "STACKED_SCALE";
    DataTable[DataTable["LAYOUT"] = 'layout'] = "LAYOUT";
})(exports.DataTable || (exports.DataTable = {}));
var DataTable = exports.DataTable;
exports.SUMMARY = DataTable.SUMMARY;
exports.SOURCE = DataTable.SOURCE;
exports.STACKED_SCALE = DataTable.STACKED_SCALE;
exports.LAYOUT = DataTable.LAYOUT;
exports.types = {
    'boolean': type_1.Type.NOMINAL,
    'number': type_1.Type.QUANTITATIVE,
    'integer': type_1.Type.QUANTITATIVE,
    'date': type_1.Type.TEMPORAL,
    'string': type_1.Type.NOMINAL
};
//# sourceMappingURL=data.js.map

/***/ }),

/***/ "xZ2+":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    ChangeSet = __webpack_require__("ekYZ"),
    Collector = __webpack_require__("B1p+"),
    Tuple = __webpack_require__("gtuQ"),
    Node = __webpack_require__("3FFs"); // jshint ignore:line

function DataSource(graph, name, facet) {
  this._graph = graph;
  this._name = name;
  this._data = [];
  this._source = null;
  this._facet  = facet;
  this._input  = ChangeSet.create();
  this._output = null; // Output changeset
  this._indexes = {};
  this._indexFields = [];

  this._inputNode  = null;
  this._outputNode = null;
  this._pipeline  = null; // Pipeline of transformations.
  this._collector = null; // Collector to materialize output of pipeline.
  this._mutates = false;  // Does any pipeline operator mutate tuples?
}

var prototype = DataSource.prototype;

prototype.name = function(name) {
  if (!arguments.length) return this._name;
  return (this._name = name, this);
};

prototype.source = function(src) {
  if (!arguments.length) return this._source;
  return (this._source = this._graph.data(src));
};

prototype.insert = function(tuples) {
  this._input.add = this._input.add.concat(tuples.map(Tuple.ingest));
  return this;
};

prototype.remove = function(where) {
  var remove = this._data.filter(where);
  this._input.rem = this._input.rem.concat(remove);
  return this;
};

prototype.update = function(where, field, func) {
  var mod = this._input.mod,
      ids = Tuple.idMap(mod);

  this._input.fields[field] = 1;

  this._data.filter(where).forEach(function(x) {
    var prev = x[field],
        next = func(x);
    if (prev !== next) {
      Tuple.set(x, field, next);
      if (ids[x._id] !== 1) {
        mod.push(x);
        ids[x._id] = 1;
      }
    }
  });

  return this;
};

prototype.values = function(data) {
  if (!arguments.length) return this._collector.data();

  // Replace backing data
  this._input.rem = this._data.slice();
  if (data) { this.insert(data); }
  return this;
};

prototype.mutates = function(m) {
  if (!arguments.length) return this._mutates;
  this._mutates = this._mutates || m;
  return this;
};

prototype.last = function() {
  return this._output;
};

prototype.fire = function(input) {
  if (input) this._input = input;
  this._graph.propagate(this._input, this._pipeline[0]);
  return this;
};

prototype.pipeline = function(pipeline) {
  if (!arguments.length) return this._pipeline;

  var graph = this._graph,
      status;

  pipeline.unshift(this._inputNode = DataSourceInput(this));
  status = graph.preprocess(pipeline);

  if (status.router) {
    pipeline.push(status.collector = new Collector(graph));
  }

  pipeline.push(this._outputNode = DataSourceOutput(this));
  this._collector = status.collector;
  this._mutates = !!status.mutates;
  graph.connect(this._pipeline = pipeline);

  return this;
};

prototype.synchronize = function() {
  this._graph.synchronize(this._pipeline);
  return this;
};

prototype.getIndex = function(field) {
  var data = this.values(),
      indexes = this._indexes,
      fields  = this._indexFields,
      f = dl.$(field),
      index, i, len, value;

  if (!indexes[field]) {
    indexes[field] = index = {};
    fields.push(field);
    for (i=0, len=data.length; i<len; ++i) {
      value = f(data[i]);
      index[value] = (index[value] || 0) + 1;
      Tuple.prev_init(data[i]);
    }
  }
  return indexes[field];
};

prototype.listener = function() {
  return DataSourceListener(this).addListener(this._inputNode);
};

prototype.addListener = function(l) {
  if (l instanceof DataSource) {
    this._collector.addListener(l.listener());
  } else {
    this._outputNode.addListener(l);
  }
  return this;
};

prototype.removeListener = function(l) {
  this._outputNode.removeListener(l);
};

prototype.listeners = function(ds) {
  return (ds ? this._collector : this._outputNode).listeners();
};

// Input node applies the datasource's delta, and propagates it to
// the rest of the pipeline. It receives touches to reflow data.
function DataSourceInput(ds) {
  var input = new Node(ds._graph)
    .router(true)
    .collector(true);

  input.data = function() {
    return ds._data;
  };

  input.evaluate = function(input) {
    log.debug(input, ['input', ds._name]);

    var delta = ds._input,
        out = ChangeSet.create(input), f;

    // Delta might contain fields updated through API
    for (f in delta.fields) {
      out.fields[f] = 1;
    }

    // update data
    if (delta.rem.length) {
      ds._data = Tuple.idFilter(ds._data, delta.rem);
    }

    if (delta.add.length) {
      ds._data = ds._data.concat(delta.add);
    }

    if (delta.sort) {
      ds._data.sort(delta.sort);
    }

    // if reflowing, add any other tuples not currently in changeset
    if (input.reflow) {
      delta.mod = delta.mod.concat(
        Tuple.idFilter(ds._data, delta.add, delta.mod, delta.rem));
    }

    // reset change list
    ds._input = ChangeSet.create();

    out.add = delta.add;
    out.mod = delta.mod;
    out.rem = delta.rem;
    out.facet = ds._facet;
    return out;
  };

  return input;
}

// Output node captures the last changeset seen by this datasource
// (needed for joins and builds) and materializes any nested data.
// If this datasource is faceted, materializes the values in the facet.
function DataSourceOutput(ds) {
  var output = new Node(ds._graph)
    .router(true)
    .reflows(true)
    .collector(true);

  function updateIndices(pulse) {
    var fields = ds._indexFields,
        i, j, f, key, index, value;

    for (i=0; i<fields.length; ++i) {
      key = fields[i];
      index = ds._indexes[key];
      f = dl.$(key);

      for (j=0; j<pulse.add.length; ++j) {
        value = f(pulse.add[j]);
        Tuple.prev_init(pulse.add[j]);
        index[value] = (index[value] || 0) + 1;
      }
      for (j=0; j<pulse.rem.length; ++j) {
        value = f(pulse.rem[j]);
        index[value] = (index[value] || 0) - 1;
      }
      for (j=0; j<pulse.mod.length; ++j) {
        value = f(pulse.mod[j]._prev);
        index[value] = (index[value] || 0) - 1;
        value = f(pulse.mod[j]);
        index[value] = (index[value] || 0) + 1;
      }
    }
  }

  output.data = function() {
    return ds._collector ? ds._collector.data() : ds._data;
  };

  output.evaluate = function(input) {
    log.debug(input, ['output', ds._name]);

    updateIndices(input);
    var out = ChangeSet.create(input, true);

    if (ds._facet) {
      ds._facet.values = ds.values();
      input.facet = null;
    }

    ds._output = input;
    out.data[ds._name] = 1;
    return out;
  };

  return output;
}

function DataSourceListener(ds) {
  var l = new Node(ds._graph).router(true);

  l.evaluate = function(input) {
    // Tuple derivation carries a cost. So only derive if the pipeline has
    // operators that mutate, and thus would override the source data.
    if (ds.mutates()) {
      var map = ds._srcMap || (ds._srcMap = {}), // to propagate tuples correctly
          output = ChangeSet.create(input);

      output.add = input.add.map(function(t) {
        return (map[t._id] = Tuple.derive(t));
      });

      output.mod = input.mod.map(function(t) {
        return Tuple.rederive(t, map[t._id]);
      });

      output.rem = input.rem.map(function(t) {
        var o = map[t._id];
        return (map[t._id] = null, o);
      });

      return (ds._input = output);
    } else {
      return (ds._input = input);
    }
  };

  return l;
}

module.exports = DataSource;


/***/ }),

/***/ "yLCL":
/***/ (function(module, exports, __webpack_require__) {

var Tuple = __webpack_require__("Hqva").Tuple,
    log = __webpack_require__("J731"),
    Transform = __webpack_require__("4JPs"),
    BatchTransform = __webpack_require__("acp7");

function Rank(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    field: {type: 'field', default: null},
    normalize: {type: 'value', default: false}
  });

  this._output = {
    'rank': 'rank'
  };

  return this.mutates(true);
}

var prototype = (Rank.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Rank;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['rank']);

  var rank  = this._output.rank,
      norm  = this.param('normalize'),
      field = this.param('field').accessor,
      keys = {}, 
      i, len = data.length, klen, d, f;

  // If we have a field accessor, first compile distinct keys.
  if (field) {
    for (i=0, klen=0; i<len; ++i) {
      d = data[i];
      keys[f=field(d)] = keys[f] || (keys[f] = ++klen);
    }
  }

  // Assign ranks to all tuples.
  for (i=0; i<len && (d=data[i]); ++i) {
    if (field && (f=field(d))) {
      Tuple.set(d, rank, norm ? keys[f] / klen : keys[f]);
    } else {
      Tuple.set(d, rank, norm ? (i+1) / len : (i+1));
    }
  }

  input.fields[rank] = 1;
  return input;
};

module.exports = Rank;

Rank.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Rank transform",
  "description": "Computes ascending rank scores for data tuples.",
  "type": "object",
  "properties": {
    "type": {"enum": ["rank"]},
    "field": {
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}],
      "description": "A key field to used to rank tuples. " +
        "If undefined, tuples will be ranked in their observed order."
    },
    "normalize": {
      "description": "If true, values of the output field will lie in the range [0, 1].",
      "oneOf": [{"type": "boolean"}, {"$ref": "#/refs/signal"}],
      "default": false
    },
    "output": {
      "type": "object",
      "description": "Rename the output data fields",
      "properties": {
        "rank": {"type": "string", "default": "rank"}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false,
  "required": ["type"]
};


/***/ }),

/***/ "yLwJ":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (SortOrder) {
    SortOrder[SortOrder["ASCENDING"] = 'ascending'] = "ASCENDING";
    SortOrder[SortOrder["DESCENDING"] = 'descending'] = "DESCENDING";
    SortOrder[SortOrder["NONE"] = 'none'] = "NONE";
})(exports.SortOrder || (exports.SortOrder = {}));
var SortOrder = exports.SortOrder;
//# sourceMappingURL=sort.js.map

/***/ }),

/***/ "yQql":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n"),
    format = __webpack_require__("GXhC");

var context = {
  formats:    [],
  format_map: {},
  truncate:   util.truncate,
  pad:        util.pad,
  day:        format.day,
  month:      format.month,
  quarter:    format.quarter,
  utcQuarter: format.utcQuarter
};

function template(text) {
  var src = source(text, 'd');
  src = 'var __t; return ' + src + ';';

  /* jshint evil: true */
  return (new Function('d', src)).bind(context);
}

template.source = source;
template.context = context;
template.format = get_format;
module.exports = template;

// Clear cache of format objects.
// This can *break* prior template functions, so invoke with care!
template.clearFormatCache = function() {
  context.formats = [];
  context.format_map = {};
};

// Generate property access code for use within template source.
// object: the name of the object (variable) containing template data
// property: the property access string, verbatim from template tag
template.property = function(object, property) {
  var src = util.field(property).map(util.str).join('][');
  return object + '[' + src + ']';
};

// Generate source code for a template function.
// text: the template text
// variable: the name of the data object variable ('obj' by default)
// properties: optional hash for collecting all accessed properties
function source(text, variable, properties) {
  variable = variable || 'obj';
  var index = 0;
  var src = '\'';
  var regex = template_re;

  // Compile the template source, escaping string literals appropriately.
  text.replace(regex, function(match, interpolate, offset) {
    src += text
      .slice(index, offset)
      .replace(template_escaper, template_escapeChar);
    index = offset + match.length;

    if (interpolate) {
      src += '\'\n+((__t=(' +
        template_var(interpolate, variable, properties) +
        '))==null?\'\':__t)+\n\'';
    }

    // Adobe VMs need the match returned to produce the correct offest.
    return match;
  });
  return src + '\'';
}

function template_var(text, variable, properties) {
  var filters = text.match(filter_re);
  var prop = filters.shift().trim();
  var stringCast = true;

  function strcall(fn) {
    fn = fn || '';
    if (stringCast) {
      stringCast = false;
      src = 'String(' + src + ')' + fn;
    } else {
      src += fn;
    }
    return src;
  }

  function date() {
    return '(typeof ' + src + '==="number"?new Date('+src+'):'+src+')';
  }

  function formatter(type) {
    var pattern = args[0];
    if ((pattern[0] === '\'' && pattern[pattern.length-1] === '\'') ||
        (pattern[0] === '"'  && pattern[pattern.length-1] === '"')) {
      pattern = pattern.slice(1, -1);
    } else {
      throw Error('Format pattern must be quoted: ' + pattern);
    }
    a = template_format(pattern, type);
    stringCast = false;
    var arg = type === 'number' ? src : date();
    src = 'this.formats['+a+']('+arg+')';
  }

  if (properties) properties[prop] = 1;
  var src = template.property(variable, prop);

  for (var i=0; i<filters.length; ++i) {
    var f = filters[i], args = null, pidx, a, b;

    if ((pidx=f.indexOf(':')) > 0) {
      f = f.slice(0, pidx);
      args = filters[i].slice(pidx+1)
        .match(args_re)
        .map(function(s) { return s.trim(); });
    }
    f = f.trim();

    switch (f) {
      case 'length':
        strcall('.length');
        break;
      case 'lower':
        strcall('.toLowerCase()');
        break;
      case 'upper':
        strcall('.toUpperCase()');
        break;
      case 'lower-locale':
        strcall('.toLocaleLowerCase()');
        break;
      case 'upper-locale':
        strcall('.toLocaleUpperCase()');
        break;
      case 'trim':
        strcall('.trim()');
        break;
      case 'left':
        a = util.number(args[0]);
        strcall('.slice(0,' + a + ')');
        break;
      case 'right':
        a = util.number(args[0]);
        strcall('.slice(-' + a +')');
        break;
      case 'mid':
        a = util.number(args[0]);
        b = a + util.number(args[1]);
        strcall('.slice(+'+a+','+b+')');
        break;
      case 'slice':
        a = util.number(args[0]);
        strcall('.slice('+ a +
          (args.length > 1 ? ',' + util.number(args[1]) : '') +
          ')');
        break;
      case 'truncate':
        a = util.number(args[0]);
        b = args[1];
        b = (b!=='left' && b!=='middle' && b!=='center') ? 'right' : b;
        src = 'this.truncate(' + strcall() + ',' + a + ',\'' + b + '\')';
        break;
      case 'pad':
        a = util.number(args[0]);
        b = args[1];
        b = (b!=='left' && b!=='middle' && b!=='center') ? 'right' : b;
        src = 'this.pad(' + strcall() + ',' + a + ',\'' + b + '\')';
        break;
      case 'number':
        formatter('number');
        break;
      case 'time':
        formatter('time');
        break;
      case 'time-utc':
        formatter('utc');
        break;
      case 'month':
        src = 'this.month(' + src + ')';
        break;
      case 'month-abbrev':
        src = 'this.month(' + src + ',true)';
        break;
      case 'day':
        src = 'this.day(' + src + ')';
        break;
      case 'day-abbrev':
        src = 'this.day(' + src + ',true)';
        break;
      case 'quarter':
        src = 'this.quarter(' + src + ')';
        break;
      case 'quarter-utc':
        src = 'this.utcQuarter(' + src + ')';
        break;
      default:
        throw Error('Unrecognized template filter: ' + f);
    }
  }

  return src;
}

var template_re = /\{\{(.+?)\}\}|$/g,
    filter_re = /(?:"[^"]*"|\'[^\']*\'|[^\|"]+|[^\|\']+)+/g,
    args_re = /(?:"[^"]*"|\'[^\']*\'|[^,"]+|[^,\']+)+/g;

// Certain characters need to be escaped so that they can be put into a
// string literal.
var template_escapes = {
  '\'':     '\'',
  '\\':     '\\',
  '\r':     'r',
  '\n':     'n',
  '\u2028': 'u2028',
  '\u2029': 'u2029'
};

var template_escaper = /\\|'|\r|\n|\u2028|\u2029/g;

function template_escapeChar(match) {
  return '\\' + template_escapes[match];
}

function template_format(pattern, type) {
  var key = type + ':' + pattern;
  if (context.format_map[key] == null) {
    var f = format[type](pattern);
    var i = context.formats.length;
    context.formats.push(f);
    context.format_map[key] = i;
    return i;
  }
  return context.format_map[key];
}

function get_format(pattern, type) {
  return context.formats[template_format(pattern, type)];
}


/***/ }),

/***/ "yaQe":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW");

var types = {
  '=':   parseComparator,
  '==':  parseComparator,
  '!=':  parseComparator,
  '>':   parseComparator,
  '>=':  parseComparator,
  '<':   parseComparator,
  '<=':  parseComparator,
  'and': parseLogical,
  '&&':  parseLogical,
  'or':  parseLogical,
  '||':  parseLogical,
  'in':  parseIn
};

var nullScale = function() { return 0; };
nullScale.invert = nullScale;

function parsePredicates(model, spec) {
  (spec || []).forEach(function(s) {
    var parse = types[s.type](model, s);

    /* jshint evil:true */
    var pred  = Function("args", "db", "signals", "predicates", parse.code);
    pred.root = function() { return model.scene().items[0]; }; // For global scales
    pred.nullScale = nullScale;
    pred.isFunction = dl.isFunction;
    pred.signals = parse.signals;
    pred.data = parse.data;

    model.predicate(s.name, pred);
  });

  return spec;
}

function parseSignal(signal, signals) {
  var s = dl.field(signal),
      code = "signals["+s.map(dl.str).join("][")+"]";
  signals[s[0]] = 1;
  return code;
}

function parseOperands(model, operands) {
  var decl = [], defs = [],
      signals = {}, db = {};

  function setSignal(s) { signals[s] = 1; }
  function setData(d) { db[d] = 1; }

  dl.array(operands).forEach(function(o, i) {
    var name = "o" + i,
        def = "";

    if (o.value !== undefined) {
      def = dl.str(o.value);
    } else if (o.arg) {
      def = "args["+dl.str(o.arg)+"]";
    } else if (o.signal) {
      def = parseSignal(o.signal, signals);
    } else if (o.predicate) {
      var ref = o.predicate,
          predName = ref && (ref.name || ref),
          pred = model.predicate(predName),
          p = "predicates["+dl.str(predName)+"]";

      pred.signals.forEach(setSignal);
      pred.data.forEach(setData);

      if (dl.isObject(ref)) {
        dl.keys(ref).forEach(function(k) {
          if (k === "name") return;
          var i = ref[k];
          def += "args["+dl.str(k)+"] = ";
          if (i.signal) {
            def += parseSignal(i.signal, signals);
          } else if (i.arg) {
            def += "args["+dl.str(i.arg)+"]";
          }
          def += ", ";
        });
      }

      def += p+".call("+p+", args, db, signals, predicates)";
    }

    decl.push(name);
    defs.push(name+"=("+def+")");
  });

  return {
    code: "var " + decl.join(", ") + ";\n" + defs.join(";\n") + ";\n",
    signals: dl.keys(signals),
    data: dl.keys(db)
  };
}

function parseComparator(model, spec) {
  var ops = parseOperands(model, spec.operands);
  if (spec.type === '=') spec.type = '==';

  ops.code += "o0 = o0 instanceof Date ? o0.getTime() : o0;\n" +
    "o1 = o1 instanceof Date ? o1.getTime() : o1;\n";

  return {
    code: ops.code + "return " + ["o0", "o1"].join(spec.type) + ";",
    signals: ops.signals,
    data: ops.data
  };
}

function parseLogical(model, spec) {
  var ops = parseOperands(model, spec.operands),
      o = [], i = 0, len = spec.operands.length;

  while (o.push("o"+i++) < len);
  if (spec.type === 'and') spec.type = '&&';
  else if (spec.type === 'or') spec.type = '||';

  return {
    code: ops.code + "return " + o.join(spec.type) + ";",
    signals: ops.signals,
    data: ops.data
  };
}

function parseIn(model, spec) {
  var o = [spec.item], code = "";
  if (spec.range) o.push.apply(o, spec.range);
  if (spec.scale) {
    code = parseScale(spec.scale, o);
  }

  var ops = parseOperands(model, o);
  code = ops.code + code + "\n  var ordSet = null;\n";

  if (spec.data) {
    var field = dl.field(spec.field).map(dl.str);
    code += "var where = function(d) { return d["+field.join("][")+"] == o0 };\n";
    code += "return db["+dl.str(spec.data)+"].filter(where).length > 0;";
  } else if (spec.range) {
    // TODO: inclusive/exclusive range?
    if (spec.scale) {
      code += "if (scale.length == 2) {\n" + // inverting ordinal scales
        "  ordSet = scale(o1, o2);\n" +
        "} else {\n" +
        "  o1 = scale(o1);\no2 = scale(o2);\n" +
        "}";
    }

    code += "return ordSet !== null ? ordSet.indexOf(o0) !== -1 :\n" +
      "  o1 < o2 ? o1 <= o0 && o0 <= o2 : o2 <= o0 && o0 <= o1;";
  }

  return {
    code: code,
    signals: ops.signals,
    data: ops.data.concat(spec.data ? [spec.data] : [])
  };
}

// Populate ops such that ultimate scale/inversion function will be in `scale` var.
function parseScale(spec, ops) {
  var code = "var scale = ",
      idx  = ops.length;

  if (dl.isString(spec)) {
    ops.push({ value: spec });
    code += "this.root().scale(o"+idx+")";
  } else if (spec.arg) {  // Scale function is being passed as an arg
    ops.push(spec);
    code += "o"+idx;
  } else if (spec.name) { // Full scale parameter {name: ..}
    ops.push(dl.isString(spec.name) ? {value: spec.name} : spec.name);
    code += "(this.isFunction(o"+idx+") ? o"+idx+" : ";
    if (spec.scope) {
      ops.push(spec.scope);
      code += "((o"+(idx+1)+".scale || this.root().scale)(o"+idx+") || this.nullScale)";
    } else {
      code += "this.root().scale(o"+idx+")";
    }
    code += ")";
  }

  if (spec.invert === true) {  // Allow spec.invert.arg?
    code += ".invert";
  }

  return code+";\n";
}

module.exports = parsePredicates;
parsePredicates.schema = {
  "refs": {
    "operand": {
      "type": "object",
      "oneOf": [
        {
          "properties": {"value": {}},
          "required": ["value"]
        },
        {
          "properties": {"arg": {"type": "string"}},
          "required": ["arg"]
        },
        {"$ref": "#/refs/signal"},
        {
          "properties": {
            "predicate": {
              "oneOf": [
                {"type": "string"},
                {
                  "type": "object",
                  "properties": {"name": {"type": "string"}},
                  "required": ["name"]
                }
              ]
            }
          },
          "required": ["predicate"]
        }
      ]
    }
  },

  "defs": {
    "predicate": {
      "type": "object",
      "oneOf": [{
        "properties": {
          "name": {"type": "string"},
          "type": {"enum": ["==", "!=", ">", "<", ">=", "<="]},
          "operands": {
            "type": "array",
            "items": {"$ref": "#/refs/operand"},
            "minItems": 2,
            "maxItems": 2
          }
        },
        "required": ["name", "type", "operands"]
      }, {
        "properties": {
          "name": {"type": "string"},
          "type": {"enum": ["and", "&&", "or", "||"]},
          "operands": {
            "type": "array",
            "items": {"$ref": "#/refs/operand"},
            "minItems": 2
          }
        },
        "required": ["name", "type", "operands"]
      }, {
        "properties": {
          "name": {"type": "string"},
          "type": {"enum": ["in"]},
          "item": {"$ref": "#/refs/operand"}
        },

        "oneOf": [
          {
            "properties": {
              "range": {
                "type": "array",
                "items": {"$ref": "#/refs/operand"},
                "minItems": 2
              },
              "scale": {"$ref": "#/refs/scopedScale"}
            },
            "required": ["range"]
          },
          {
            "properties": {
              "data": {"type": "string"},
              "field": {"type": "string"}
            },
            "required": ["data", "field"]
          }
        ],

        "required": ["name", "type", "item"]
      }]
    }
  }
};


/***/ }),

/***/ "ybCx":
/***/ (function(module, exports, __webpack_require__) {

var dl  = __webpack_require__("zicW"),
    log = __webpack_require__("J731"),
    themeVal = __webpack_require__("YvtE"),
    Model = __webpack_require__("PwiD"),
    View  = __webpack_require__("+5nH");

/**
 * Parse graph specification
 * @param spec (object)
 * @param config (optional object)
 * @param viewFactory (optional function)
 * @param callback (error, model)
 */
 function parseSpec(spec /*, [config,] [viewFactory,] callback */) {
  // do not assign any values to callback, as it will change arguments
  var arglen = arguments.length,
      argidx = 2,
      cb = arguments[arglen-1],
      model = new Model(),
      viewFactory = View.factory,
      config;

  if (arglen > argidx && dl.isFunction(arguments[arglen - argidx])) {
    viewFactory = arguments[arglen - argidx];
    ++argidx;
  }

  if (arglen > argidx && dl.isObject(arguments[arglen - argidx])) {
    model.config(arguments[arglen - argidx]);
  }

  config = model.config();
  if (dl.isObject(spec)) {
    parse(spec);
  } else if (dl.isString(spec)) {
    var opts = dl.extend({url: spec}, config.load);
    dl.json(opts, function(err, spec) {
      if (err) done('SPECIFICATION LOAD FAILED: ' + err);
      else parse(spec);
    });
  } else {
    done('INVALID SPECIFICATION: Must be a valid JSON object or URL.');
  }

  function parse(spec) {
    try {
      // protect against subsequent spec modification
      spec = dl.duplicate(spec);

      var parsers = __webpack_require__("UaGl"),
          width   = themeVal(spec, config, 'width', 500),
          height  = themeVal(spec, config, 'height', 500),
          padding = parsers.padding(themeVal(spec, config, 'padding')),
          background = themeVal(spec, config, 'background');

      // create signals for width, height, padding, and cursor
      model.signal('width', width);
      model.signal('height', height);
      model.signal('padding', padding);
      cursor(spec);

      // initialize model
      model.defs({
        width:      width,
        height:     height,
        padding:    padding,
        viewport:   spec.viewport || null,
        background: parsers.background(background),
        signals:    parsers.signals(model, spec.signals),
        predicates: parsers.predicates(model, spec.predicates),
        marks:      parsers.marks(model, spec, width, height),
        data:       parsers.data(model, spec.data, done)
      });
    } catch (err) { done(err); }
  }

  function cursor(spec) {
    var signals = spec.signals || (spec.signals=[]),  def;
    signals.some(function(sg) {
      return (sg.name === 'cursor') ? (def=sg, true) : false;
    });

    if (!def) signals.push(def={name: 'cursor', streams: []});

    // Add a stream def at the head, so that custom defs can override it.
    def.init = def.init || {};
    def.streams.unshift({
      type: 'mousemove',
      expr: 'eventItem().cursor === cursor.default ? cursor : {default: eventItem().cursor}'
    });
  }

  function done(err) {
    var view;
    if (err) {
      log.error(err);
    } else {
      view = viewFactory(model.buildIndexes());
    }

    if (cb) {
      if (cb.length > 1) cb(err, view);
      else if (!err) cb(view);
      cb = null;
    }
  }
}

module.exports = parseSpec;

parseSpec.schema = {
  "defs": {
    "spec": {
      "title": "Vega visualization specification",
      "type": "object",

      "allOf": [{"$ref": "#/defs/container"}, {
        "properties": {
          "width": {"type": "number"},
          "height": {"type": "number"},
          "viewport": {
            "type": "array",
            "items": {"type": "number"},
            "maxItems": 2
          },

          "background": {"$ref": "#/defs/background"},
          "padding": {"$ref": "#/defs/padding"},

          "signals": {
            "type": "array",
            "items": {"$ref": "#/defs/signal"}
          },

          "predicates": {
            "type": "array",
            "items": {"$ref": "#/defs/predicate"}
          },

          "data": {
            "type": "array",
            "items": {"$ref": "#/defs/data"}
          }
        }
      }]
    }
  }
};


/***/ }),

/***/ "yixx":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var scale_1 = __webpack_require__("Fw/k");
var util_1 = __webpack_require__("ZAUf");
var nonPositiveFilter;
(function (nonPositiveFilter_1) {
    function parseUnit(model) {
        return model.channels().reduce(function (nonPositiveComponent, channel) {
            var scale = model.scale(channel);
            if (!model.field(channel) || !scale) {
                return nonPositiveComponent;
            }
            nonPositiveComponent[model.field(channel)] = scale.type === scale_1.ScaleType.LOG;
            return nonPositiveComponent;
        }, {});
    }
    nonPositiveFilter_1.parseUnit = parseUnit;
    function parseFacet(model) {
        var childDataComponent = model.child().component.data;
        if (!childDataComponent.source) {
            var nonPositiveFilterComponent = childDataComponent.nonPositiveFilter;
            delete childDataComponent.nonPositiveFilter;
            return nonPositiveFilterComponent;
        }
        return {};
    }
    nonPositiveFilter_1.parseFacet = parseFacet;
    function parseLayer(model) {
        var nonPositiveFilter = {};
        model.children().forEach(function (child) {
            var childDataComponent = child.component.data;
            if (model.compatibleSource(child) && !util_1.differ(childDataComponent.nonPositiveFilter, nonPositiveFilter)) {
                util_1.extend(nonPositiveFilter, childDataComponent.nonPositiveFilter);
                delete childDataComponent.nonPositiveFilter;
            }
        });
        return nonPositiveFilter;
    }
    nonPositiveFilter_1.parseLayer = parseLayer;
    function assemble(component) {
        return util_1.keys(component.nonPositiveFilter).filter(function (field) {
            return component.nonPositiveFilter[field];
        }).map(function (field) {
            return {
                type: 'filter',
                test: 'datum.' + field + ' > 0'
            };
        });
    }
    nonPositiveFilter_1.assemble = assemble;
})(nonPositiveFilter = exports.nonPositiveFilter || (exports.nonPositiveFilter = {}));
//# sourceMappingURL=nonpositivenullfilter.js.map

/***/ }),

/***/ "yszh":
/***/ (function(module, exports, __webpack_require__) {

var DOM = __webpack_require__("sV93"),
    Handler = __webpack_require__("VeBo");

function SVGHandler() {
  Handler.call(this);
}

var base = Handler.prototype;
var prototype = (SVGHandler.prototype = Object.create(base));
prototype.constructor = SVGHandler;

prototype.initialize = function(el, pad, obj) {
  this._svg = DOM.find(el, 'svg');
  return base.initialize.call(this, el, pad, obj);
};

prototype.svg = function() {
  return this._svg;
};

// wrap an event listener for the SVG DOM
prototype.listener = function(handler) {
  var that = this;
  return function(evt) {
    var target = evt.target,
        item = target.__data__;
    evt.vegaType = evt.type;
    item = Array.isArray(item) ? item[0] : item;
    handler.call(that._obj, evt, item);
  };
};

// add an event handler
prototype.on = function(type, handler) {
  var name = this.eventName(type),
      svg = this._svg,
      h = this._handlers,
      x = {
        type:     type,
        handler:  handler,
        listener: this.listener(handler)
      };

  (h[name] || (h[name] = [])).push(x);
  svg.addEventListener(name, x.listener);
  return this;
};

// remove an event handler
prototype.off = function(type, handler) {
  var name = this.eventName(type),
      svg = this._svg,
      h = this._handlers[name], i;
  if (!h) return;
  for (i=h.length; --i>=0;) {
    if (h[i].type === type && !handler || h[i].handler === handler) {
      svg.removeEventListener(name, h[i].listener);
      h.splice(i, 1);
    }
  }
  return this;
};

module.exports = SVGHandler;


/***/ }),

/***/ "z/Ym":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var data_1 = __webpack_require__("x6Fv");
var spec_1 = __webpack_require__("F9eC");
var util_1 = __webpack_require__("ZAUf");
var common_1 = __webpack_require__("MtYt");
function compile(inputSpec) {
    var spec = spec_1.normalize(inputSpec);
    var model = common_1.buildModel(spec, null, '');
    model.parse();
    return assemble(model);
}
exports.compile = compile;
function assemble(model) {
    var config = model.config();
    var output = util_1.extend({
        width: 1,
        height: 1,
        padding: 'auto'
    }, config.viewport ? { viewport: config.viewport } : {}, config.background ? { background: config.background } : {}, {
        data: [].concat(model.assembleData([]), model.assembleLayout([])),
        marks: [assembleRootGroup(model)]
    });
    return {
        spec: output
    };
}
function assembleRootGroup(model) {
    var rootGroup = util_1.extend({
        name: model.name('root'),
        type: 'group',
    }, model.description() ? { description: model.description() } : {}, {
        from: { data: data_1.LAYOUT },
        properties: {
            update: util_1.extend({
                width: { field: 'width' },
                height: { field: 'height' }
            }, model.assembleParentGroupProperties(model.config().cell))
        }
    });
    return util_1.extend(rootGroup, model.assembleGroup());
}
exports.assembleRootGroup = assembleRootGroup;
//# sourceMappingURL=compile.js.map

/***/ }),

/***/ "z5TJ":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

(function (TimeUnit) {
    TimeUnit[TimeUnit["YEAR"] = 'year'] = "YEAR";
    TimeUnit[TimeUnit["MONTH"] = 'month'] = "MONTH";
    TimeUnit[TimeUnit["DAY"] = 'day'] = "DAY";
    TimeUnit[TimeUnit["DATE"] = 'date'] = "DATE";
    TimeUnit[TimeUnit["HOURS"] = 'hours'] = "HOURS";
    TimeUnit[TimeUnit["MINUTES"] = 'minutes'] = "MINUTES";
    TimeUnit[TimeUnit["SECONDS"] = 'seconds'] = "SECONDS";
    TimeUnit[TimeUnit["MILLISECONDS"] = 'milliseconds'] = "MILLISECONDS";
    TimeUnit[TimeUnit["YEARMONTH"] = 'yearmonth'] = "YEARMONTH";
    TimeUnit[TimeUnit["YEARMONTHDAY"] = 'yearmonthday'] = "YEARMONTHDAY";
    TimeUnit[TimeUnit["YEARMONTHDATE"] = 'yearmonthdate'] = "YEARMONTHDATE";
    TimeUnit[TimeUnit["YEARDAY"] = 'yearday'] = "YEARDAY";
    TimeUnit[TimeUnit["YEARDATE"] = 'yeardate'] = "YEARDATE";
    TimeUnit[TimeUnit["YEARMONTHDAYHOURS"] = 'yearmonthdayhours'] = "YEARMONTHDAYHOURS";
    TimeUnit[TimeUnit["YEARMONTHDAYHOURSMINUTES"] = 'yearmonthdayhoursminutes'] = "YEARMONTHDAYHOURSMINUTES";
    TimeUnit[TimeUnit["YEARMONTHDAYHOURSMINUTESSECONDS"] = 'yearmonthdayhoursminutesseconds'] = "YEARMONTHDAYHOURSMINUTESSECONDS";
    TimeUnit[TimeUnit["HOURSMINUTES"] = 'hoursminutes'] = "HOURSMINUTES";
    TimeUnit[TimeUnit["HOURSMINUTESSECONDS"] = 'hoursminutesseconds'] = "HOURSMINUTESSECONDS";
    TimeUnit[TimeUnit["MINUTESSECONDS"] = 'minutesseconds'] = "MINUTESSECONDS";
    TimeUnit[TimeUnit["SECONDSMILLISECONDS"] = 'secondsmilliseconds'] = "SECONDSMILLISECONDS";
    TimeUnit[TimeUnit["QUARTER"] = 'quarter'] = "QUARTER";
    TimeUnit[TimeUnit["YEARQUARTER"] = 'yearquarter'] = "YEARQUARTER";
    TimeUnit[TimeUnit["QUARTERMONTH"] = 'quartermonth'] = "QUARTERMONTH";
    TimeUnit[TimeUnit["YEARQUARTERMONTH"] = 'yearquartermonth'] = "YEARQUARTERMONTH";
})(exports.TimeUnit || (exports.TimeUnit = {}));
var TimeUnit = exports.TimeUnit;
exports.TIMEUNITS = [
    TimeUnit.YEAR,
    TimeUnit.MONTH,
    TimeUnit.DAY,
    TimeUnit.DATE,
    TimeUnit.HOURS,
    TimeUnit.MINUTES,
    TimeUnit.SECONDS,
    TimeUnit.MILLISECONDS,
    TimeUnit.YEARMONTH,
    TimeUnit.YEARMONTHDAY,
    TimeUnit.YEARMONTHDATE,
    TimeUnit.YEARDAY,
    TimeUnit.YEARDATE,
    TimeUnit.YEARMONTHDAYHOURS,
    TimeUnit.YEARMONTHDAYHOURSMINUTES,
    TimeUnit.YEARMONTHDAYHOURSMINUTESSECONDS,
    TimeUnit.HOURSMINUTES,
    TimeUnit.HOURSMINUTESSECONDS,
    TimeUnit.MINUTESSECONDS,
    TimeUnit.SECONDSMILLISECONDS,
    TimeUnit.QUARTER,
    TimeUnit.YEARQUARTER,
    TimeUnit.QUARTERMONTH,
    TimeUnit.YEARQUARTERMONTH,
];
function template(timeUnit, field, shortTimeLabels) {
    if (!timeUnit) {
        return undefined;
    }
    var dateComponents = [];
    if (containsTimeUnit(timeUnit, TimeUnit.YEAR)) {
        dateComponents.push(shortTimeLabels ? '%y' : '%Y');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.QUARTER)) {
        dateComponents.push('\'}}Q{{' + field + ' | quarter}}{{' + field + ' | time:\'');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.MONTH)) {
        dateComponents.push(shortTimeLabels ? '%b' : '%B');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.DAY)) {
        dateComponents.push(shortTimeLabels ? '%a' : '%A');
    }
    else if (containsTimeUnit(timeUnit, TimeUnit.DATE)) {
        dateComponents.push('%d');
    }
    var timeComponents = [];
    if (containsTimeUnit(timeUnit, TimeUnit.HOURS)) {
        timeComponents.push('%H');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.MINUTES)) {
        timeComponents.push('%M');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.SECONDS)) {
        timeComponents.push('%S');
    }
    if (containsTimeUnit(timeUnit, TimeUnit.MILLISECONDS)) {
        timeComponents.push('%L');
    }
    var out = [];
    if (dateComponents.length > 0) {
        out.push(dateComponents.join('-'));
    }
    if (timeComponents.length > 0) {
        out.push(timeComponents.join(':'));
    }
    if (out.length > 0) {
        var template_1 = '{{' + field + ' | time:\'' + out.join(' ') + '\'}}';
        return template_1.replace(new RegExp('{{' + field + ' \\| time:\'\'}}', 'g'), '');
    }
    else {
        return undefined;
    }
}
exports.template = template;
function containsTimeUnit(fullTimeUnit, timeUnit) {
    var fullTimeUnitStr = fullTimeUnit.toString();
    var timeUnitStr = timeUnit.toString();
    return fullTimeUnitStr.indexOf(timeUnitStr) > -1;
}
exports.containsTimeUnit = containsTimeUnit;
//# sourceMappingURL=timeunit.js.map

/***/ }),

/***/ "zF6n":
/***/ (function(module, exports, __webpack_require__) {

/* WEBPACK VAR INJECTION */(function(Buffer) {var u = module.exports;

// utility functions

var FNAME = '__name__';

u.namedfunc = function(name, f) { return (f[FNAME] = name, f); };

u.name = function(f) { return f==null ? null : f[FNAME]; };

u.identity = function(x) { return x; };

u.true = u.namedfunc('true', function() { return true; });

u.false = u.namedfunc('false', function() { return false; });

u.duplicate = function(obj) {
  return JSON.parse(JSON.stringify(obj));
};

u.equal = function(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
};

u.extend = function(obj) {
  for (var x, name, i=1, len=arguments.length; i<len; ++i) {
    x = arguments[i];
    for (name in x) { obj[name] = x[name]; }
  }
  return obj;
};

u.length = function(x) {
  return x != null && x.length != null ? x.length : null;
};

u.keys = function(x) {
  var keys = [], k;
  for (k in x) keys.push(k);
  return keys;
};

u.vals = function(x) {
  var vals = [], k;
  for (k in x) vals.push(x[k]);
  return vals;
};

u.toMap = function(list, f) {
  return (f = u.$(f)) ?
    list.reduce(function(obj, x) { return (obj[f(x)] = 1, obj); }, {}) :
    list.reduce(function(obj, x) { return (obj[x] = 1, obj); }, {});
};

u.keystr = function(values) {
  // use to ensure consistent key generation across modules
  var n = values.length;
  if (!n) return '';
  for (var s=String(values[0]), i=1; i<n; ++i) {
    s += '|' + String(values[i]);
  }
  return s;
};

// type checking functions

var toString = Object.prototype.toString;

u.isObject = function(obj) {
  return obj === Object(obj);
};

u.isFunction = function(obj) {
  return toString.call(obj) === '[object Function]';
};

u.isString = function(obj) {
  return typeof value === 'string' || toString.call(obj) === '[object String]';
};

u.isArray = Array.isArray || function(obj) {
  return toString.call(obj) === '[object Array]';
};

u.isNumber = function(obj) {
  return typeof obj === 'number' || toString.call(obj) === '[object Number]';
};

u.isBoolean = function(obj) {
  return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
};

u.isDate = function(obj) {
  return toString.call(obj) === '[object Date]';
};

u.isValid = function(obj) {
  return obj != null && obj === obj;
};

u.isBuffer = (typeof Buffer === 'function' && Buffer.isBuffer) || u.false;

// type coercion functions

u.number = function(s) {
  return s == null || s === '' ? null : +s;
};

u.boolean = function(s) {
  return s == null || s === '' ? null : s==='false' ? false : !!s;
};

// parse a date with optional d3.time-format format
u.date = function(s, format) {
  var d = format ? format : Date;
  return s == null || s === '' ? null : d.parse(s);
};

u.array = function(x) {
  return x != null ? (u.isArray(x) ? x : [x]) : [];
};

u.str = function(x) {
  return u.isArray(x) ? '[' + x.map(u.str) + ']'
    : u.isObject(x) || u.isString(x) ?
      // Output valid JSON and JS source strings.
      // See http://timelessrepo.com/json-isnt-a-javascript-subset
      JSON.stringify(x).replace('\u2028','\\u2028').replace('\u2029', '\\u2029')
    : x;
};

// data access functions

var field_re = /\[(.*?)\]|[^.\[]+/g;

u.field = function(f) {
  return String(f).match(field_re).map(function(d) {
    return d[0] !== '[' ? d :
      d[1] !== "'" && d[1] !== '"' ? d.slice(1, -1) :
      d.slice(2, -2).replace(/\\(["'])/g, '$1');
  });
};

u.accessor = function(f) {
  /* jshint evil: true */
  return f==null || u.isFunction(f) ? f :
    u.namedfunc(f, Function('x', 'return x[' + u.field(f).map(u.str).join('][') + '];'));
};

// short-cut for accessor
u.$ = u.accessor;

u.mutator = function(f) {
  var s;
  return u.isString(f) && (s=u.field(f)).length > 1 ?
    function(x, v) {
      for (var i=0; i<s.length-1; ++i) x = x[s[i]];
      x[s[i]] = v;
    } :
    function(x, v) { x[f] = v; };
};


u.$func = function(name, op) {
  return function(f) {
    f = u.$(f) || u.identity;
    var n = name + (u.name(f) ? '_'+u.name(f) : '');
    return u.namedfunc(n, function(d) { return op(f(d)); });
  };
};

u.$valid  = u.$func('valid', u.isValid);
u.$length = u.$func('length', u.length);

u.$in = function(f, values) {
  f = u.$(f);
  var map = u.isArray(values) ? u.toMap(values) : values;
  return function(d) { return !!map[f(d)]; };
};

// comparison / sorting functions

u.comparator = function(sort) {
  var sign = [];
  if (sort === undefined) sort = [];
  sort = u.array(sort).map(function(f) {
    var s = 1;
    if      (f[0] === '-') { s = -1; f = f.slice(1); }
    else if (f[0] === '+') { s = +1; f = f.slice(1); }
    sign.push(s);
    return u.accessor(f);
  });
  return function(a, b) {
    var i, n, f, c;
    for (i=0, n=sort.length; i<n; ++i) {
      f = sort[i];
      c = u.cmp(f(a), f(b));
      if (c) return c * sign[i];
    }
    return 0;
  };
};

u.cmp = function(a, b) {
  return (a < b || a == null) && b != null ? -1 :
    (a > b || b == null) && a != null ? 1 :
    ((b = b instanceof Date ? +b : b),
     (a = a instanceof Date ? +a : a)) !== a && b === b ? -1 :
    b !== b && a === a ? 1 : 0;
};

u.numcmp = function(a, b) { return a - b; };

u.stablesort = function(array, sortBy, keyFn) {
  var indices = array.reduce(function(idx, v, i) {
    return (idx[keyFn(v)] = i, idx);
  }, {});

  array.sort(function(a, b) {
    var sa = sortBy(a),
        sb = sortBy(b);
    return sa < sb ? -1 : sa > sb ? 1
         : (indices[keyFn(a)] - indices[keyFn(b)]);
  });

  return array;
};

// permutes an array using a Knuth shuffle
u.permute = function(a) {
  var m = a.length,
      swap,
      i;

  while (m) {
    i = Math.floor(Math.random() * m--);
    swap = a[m];
    a[m] = a[i];
    a[i] = swap;
  }
};

// string functions

u.pad = function(s, length, pos, padchar) {
  padchar = padchar || " ";
  var d = length - s.length;
  if (d <= 0) return s;
  switch (pos) {
    case 'left':
      return strrep(d, padchar) + s;
    case 'middle':
    case 'center':
      return strrep(Math.floor(d/2), padchar) +
         s + strrep(Math.ceil(d/2), padchar);
    default:
      return s + strrep(d, padchar);
  }
};

function strrep(n, str) {
  var s = "", i;
  for (i=0; i<n; ++i) s += str;
  return s;
}

u.truncate = function(s, length, pos, word, ellipsis) {
  var len = s.length;
  if (len <= length) return s;
  ellipsis = ellipsis !== undefined ? String(ellipsis) : '\u2026';
  var l = Math.max(0, length - ellipsis.length);

  switch (pos) {
    case 'left':
      return ellipsis + (word ? truncateOnWord(s,l,1) : s.slice(len-l));
    case 'middle':
    case 'center':
      var l1 = Math.ceil(l/2), l2 = Math.floor(l/2);
      return (word ? truncateOnWord(s,l1) : s.slice(0,l1)) +
        ellipsis + (word ? truncateOnWord(s,l2,1) : s.slice(len-l2));
    default:
      return (word ? truncateOnWord(s,l) : s.slice(0,l)) + ellipsis;
  }
};

function truncateOnWord(s, len, rev) {
  var cnt = 0, tok = s.split(truncate_word_re);
  if (rev) {
    s = (tok = tok.reverse())
      .filter(function(w) { cnt += w.length; return cnt <= len; })
      .reverse();
  } else {
    s = tok.filter(function(w) { cnt += w.length; return cnt <= len; });
  }
  return s.length ? s.join('').trim() : tok[0].slice(0, len);
}

var truncate_word_re = /([\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u2028\u2029\u3000\uFEFF])/;

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__("EuP9").Buffer))

/***/ }),

/***/ "zLl/":
/***/ (function(module, exports, __webpack_require__) {

var load = __webpack_require__("5AQc");

function ImageLoader(loadConfig) {
  this._pending = 0;
  this._config = loadConfig || ImageLoader.Config; 
}

// Overridable global default load configuration
ImageLoader.Config = null;

var prototype = ImageLoader.prototype;

prototype.pending = function() {
  return this._pending;
};

prototype.params = function(uri) {
  var p = {url: uri}, k;
  for (k in this._config) { p[k] = this._config[k]; }
  return p;
};

prototype.imageURL = function(uri) {
  return load.sanitizeUrl(this.params(uri));
};

function browser(uri, callback) {
  var url = load.sanitizeUrl(this.params(uri));
  if (!url) { // error
    if (callback) callback(uri, null);
    return null;
  }

  var loader = this,
      image = new Image();

  loader._pending += 1;

  image.onload = function() {
    loader._pending -= 1;
    image.loaded = true;
    if (callback) callback(null, image);
  };
  image.src = url;

  return image;
}

function server(uri, callback) {
  var loader = this,
      image = new (__webpack_require__(8).Image)();

  loader._pending += 1;

  load(this.params(uri), function(err, data) {
    loader._pending -= 1;
    if (err) {
      if (callback) callback(err, null);
      return null;
    }
    image.src = data;
    image.loaded = true;
    if (callback) callback(null, image);
  });

  return image;
}

prototype.loadImage = function(uri, callback) {
  return load.useXHR ?
    browser.call(this, uri, callback) :
    server.call(this, uri, callback);
};

module.exports = ImageLoader;


/***/ }),

/***/ "zPnY":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("gWW/"),
    parse = __webpack_require__("eJnU"),
    render = __webpack_require__("bSC/");

var sqrt3 = Math.sqrt(3),
    tan30 = Math.tan(30 * Math.PI / 180);

function path(g, o) {
  var size = o.size != null ? o.size : 100,
      x = o.x, y = o.y, r, t, rx, ry;

  g.beginPath();

  if (o.shape == null || o.shape === 'circle') {
    r = Math.sqrt(size / Math.PI);
    g.arc(x, y, r, 0, 2*Math.PI, 0);
    g.closePath();
    return;
  }

  switch (o.shape) {
    case 'cross':
      r = Math.sqrt(size / 5) / 2;
      t = 3*r;
      g.moveTo(x-t, y-r);
      g.lineTo(x-r, y-r);
      g.lineTo(x-r, y-t);
      g.lineTo(x+r, y-t);
      g.lineTo(x+r, y-r);
      g.lineTo(x+t, y-r);
      g.lineTo(x+t, y+r);
      g.lineTo(x+r, y+r);
      g.lineTo(x+r, y+t);
      g.lineTo(x-r, y+t);
      g.lineTo(x-r, y+r);
      g.lineTo(x-t, y+r);
      break;

    case 'diamond':
      ry = Math.sqrt(size / (2 * tan30));
      rx = ry * tan30;
      g.moveTo(x, y-ry);
      g.lineTo(x+rx, y);
      g.lineTo(x, y+ry);
      g.lineTo(x-rx, y);
      break;

    case 'square':
      t = Math.sqrt(size);
      r = t / 2;
      g.rect(x-r, y-r, t, t);
      break;

    case 'triangle-down':
      rx = Math.sqrt(size / sqrt3);
      ry = rx * sqrt3 / 2;
      g.moveTo(x, y+ry);
      g.lineTo(x+rx, y-ry);
      g.lineTo(x-rx, y-ry);
      break;

    case 'triangle-up':
      rx = Math.sqrt(size / sqrt3);
      ry = rx * sqrt3 / 2;
      g.moveTo(x, y-ry);
      g.lineTo(x+rx, y+ry);
      g.lineTo(x-rx, y+ry);
      break;

    // custom shape
    default:
      var pathArray = resize(parse(o.shape), size);
      render(g, pathArray, x, y);
  }
  g.closePath();
}

// Scale custom shapes (defined within a unit square) by given size.
function resize(path, size) {
  var sz = Math.sqrt(size),
      i, n, j, m, curr;

  for (i=0, n=path.length; i<n; ++i) {
    for (curr=path[i], j=1, m=curr.length; j<m; ++j) {
      curr[j] *= sz;
    }
  }
  return path;
}

module.exports = {
  draw: util.drawAll(path),
  pick: util.pickPath(path)
};

/***/ }),

/***/ "zYzi":
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var aggregate_1 = __webpack_require__("h/tW");
var channel_1 = __webpack_require__("P/aK");
var config_1 = __webpack_require__("Py5Z");
var data_1 = __webpack_require__("x6Fv");
var vlEncoding = __webpack_require__("QSMf");
var fielddef_1 = __webpack_require__("o+e1");
var mark_1 = __webpack_require__("j8cM");
var scale_1 = __webpack_require__("Fw/k");
var type_1 = __webpack_require__("WJ2w");
var util_1 = __webpack_require__("ZAUf");
var axis_1 = __webpack_require__("HeGT");
var common_1 = __webpack_require__("MtYt");
var config_2 = __webpack_require__("pyUU");
var data_2 = __webpack_require__("V22v");
var legend_1 = __webpack_require__("jxr4");
var layout_1 = __webpack_require__("YBv9");
var model_1 = __webpack_require__("jGoH");
var mark_2 = __webpack_require__("0ZZw");
var scale_2 = __webpack_require__("TLMq");
var stack_1 = __webpack_require__("f2i1");
var UnitModel = (function (_super) {
    __extends(UnitModel, _super);
    function UnitModel(spec, parent, parentGivenName) {
        _super.call(this, spec, parent, parentGivenName);
        var mark = this._mark = spec.mark;
        var encoding = this._encoding = this._initEncoding(mark, spec.encoding || {});
        var config = this._config = this._initConfig(spec.config, parent, mark, encoding);
        this._scale = this._initScale(mark, encoding, config);
        this._axis = this._initAxis(encoding, config);
        this._legend = this._initLegend(encoding, config);
        this._stack = stack_1.stack(mark, encoding, config);
    }
    UnitModel.prototype._initEncoding = function (mark, encoding) {
        encoding = util_1.duplicate(encoding);
        vlEncoding.forEach(encoding, function (fieldDef, channel) {
            if (!channel_1.supportMark(channel, mark)) {
                console.warn(channel, 'dropped as it is incompatible with', mark);
                delete fieldDef.field;
                return;
            }
            if (fieldDef.type) {
                fieldDef.type = type_1.getFullName(fieldDef.type);
            }
            if ((channel === channel_1.PATH || channel === channel_1.ORDER) && !fieldDef.aggregate && fieldDef.type === type_1.QUANTITATIVE) {
                fieldDef.aggregate = aggregate_1.AggregateOp.MIN;
            }
        });
        return encoding;
    };
    UnitModel.prototype._initConfig = function (specConfig, parent, mark, encoding) {
        var config = util_1.mergeDeep(util_1.duplicate(config_1.defaultConfig), parent ? parent.config() : {}, specConfig);
        config.mark = config_2.initMarkConfig(mark, encoding, config);
        return config;
    };
    UnitModel.prototype._initScale = function (mark, encoding, config) {
        return channel_1.UNIT_SCALE_CHANNELS.reduce(function (_scale, channel) {
            if (vlEncoding.has(encoding, channel) ||
                (channel === channel_1.X && vlEncoding.has(encoding, channel_1.X2)) ||
                (channel === channel_1.Y && vlEncoding.has(encoding, channel_1.Y2))) {
                var channelDef = encoding[channel];
                var scaleSpec = (channelDef || {}).scale || {};
                var _scaleType = scale_2.scaleType(scaleSpec, channelDef, channel, mark);
                _scale[channel] = util_1.extend({
                    type: _scaleType,
                    round: config.scale.round,
                    padding: config.scale.padding,
                    useRawDomain: config.scale.useRawDomain,
                    bandSize: channel === channel_1.X && _scaleType === scale_1.ScaleType.ORDINAL && mark === mark_1.TEXT ?
                        config.scale.textBandWidth : config.scale.bandSize
                }, scaleSpec);
            }
            return _scale;
        }, {});
    };
    UnitModel.prototype._initAxis = function (encoding, config) {
        return [channel_1.X, channel_1.Y].reduce(function (_axis, channel) {
            if (vlEncoding.has(encoding, channel) ||
                (channel === channel_1.X && vlEncoding.has(encoding, channel_1.X2)) ||
                (channel === channel_1.Y && vlEncoding.has(encoding, channel_1.Y2))) {
                var axisSpec = (encoding[channel] || {}).axis;
                if (axisSpec !== false) {
                    _axis[channel] = util_1.extend({}, config.axis, axisSpec === true ? {} : axisSpec || {});
                }
            }
            return _axis;
        }, {});
    };
    UnitModel.prototype._initLegend = function (encoding, config) {
        return channel_1.NONSPATIAL_SCALE_CHANNELS.reduce(function (_legend, channel) {
            if (vlEncoding.has(encoding, channel)) {
                var legendSpec = encoding[channel].legend;
                if (legendSpec !== false) {
                    _legend[channel] = util_1.extend({}, config.legend, legendSpec === true ? {} : legendSpec || {});
                }
            }
            return _legend;
        }, {});
    };
    UnitModel.prototype.parseData = function () {
        this.component.data = data_2.parseUnitData(this);
    };
    UnitModel.prototype.parseSelectionData = function () {
    };
    UnitModel.prototype.parseLayoutData = function () {
        this.component.layout = layout_1.parseUnitLayout(this);
    };
    UnitModel.prototype.parseScale = function () {
        this.component.scale = scale_2.parseScaleComponent(this);
    };
    UnitModel.prototype.parseMark = function () {
        this.component.mark = mark_2.parseMark(this);
    };
    UnitModel.prototype.parseAxis = function () {
        this.component.axis = axis_1.parseAxisComponent(this, [channel_1.X, channel_1.Y]);
    };
    UnitModel.prototype.parseAxisGroup = function () {
        return null;
    };
    UnitModel.prototype.parseGridGroup = function () {
        return null;
    };
    UnitModel.prototype.parseLegend = function () {
        this.component.legend = legend_1.parseLegendComponent(this);
    };
    UnitModel.prototype.assembleData = function (data) {
        return data_2.assembleData(this, data);
    };
    UnitModel.prototype.assembleLayout = function (layoutData) {
        return layout_1.assembleLayout(this, layoutData);
    };
    UnitModel.prototype.assembleMarks = function () {
        return this.component.mark;
    };
    UnitModel.prototype.assembleParentGroupProperties = function (cellConfig) {
        return common_1.applyConfig({}, cellConfig, common_1.FILL_STROKE_CONFIG.concat(['clip']));
    };
    UnitModel.prototype.channels = function () {
        return channel_1.UNIT_CHANNELS;
    };
    UnitModel.prototype.mapping = function () {
        return this.encoding();
    };
    UnitModel.prototype.stack = function () {
        return this._stack;
    };
    UnitModel.prototype.toSpec = function (excludeConfig, excludeData) {
        var encoding = util_1.duplicate(this._encoding);
        var spec;
        spec = {
            mark: this._mark,
            encoding: encoding
        };
        if (!excludeConfig) {
            spec.config = util_1.duplicate(this._config);
        }
        if (!excludeData) {
            spec.data = util_1.duplicate(this._data);
        }
        return spec;
    };
    UnitModel.prototype.mark = function () {
        return this._mark;
    };
    UnitModel.prototype.has = function (channel) {
        return vlEncoding.has(this._encoding, channel);
    };
    UnitModel.prototype.encoding = function () {
        return this._encoding;
    };
    UnitModel.prototype.fieldDef = function (channel) {
        return this._encoding[channel] || {};
    };
    UnitModel.prototype.field = function (channel, opt) {
        if (opt === void 0) { opt = {}; }
        var fieldDef = this.fieldDef(channel);
        if (fieldDef.bin) {
            opt = util_1.extend({
                binSuffix: this.scale(channel).type === scale_1.ScaleType.ORDINAL ? '_range' : '_start'
            }, opt);
        }
        return fielddef_1.field(fieldDef, opt);
    };
    UnitModel.prototype.dataTable = function () {
        return this.dataName(vlEncoding.isAggregate(this._encoding) ? data_1.SUMMARY : data_1.SOURCE);
    };
    UnitModel.prototype.isUnit = function () {
        return true;
    };
    return UnitModel;
}(model_1.Model));
exports.UnitModel = UnitModel;
//# sourceMappingURL=unit.js.map

/***/ }),

/***/ "zhsD":
/***/ (function(module, exports, __webpack_require__) {

var dl = __webpack_require__("zicW"),
    d3_svg = __webpack_require__("Za4h").svg,
    parse = __webpack_require__("eJnU");

function x(o)     { return o.x || 0; }
function y(o)     { return o.y || 0; }
function xw(o)    { return (o.x || 0) + (o.width || 0); }
function yh(o)    { return (o.y || 0) + (o.height || 0); }
function size(o)  { return o.size == null ? 100 : o.size; }
function shape(o) { return o.shape || 'circle'; }

var areav = d3_svg.area().x(x).y1(y).y0(yh),
    areah = d3_svg.area().y(y).x1(x).x0(xw),
    line  = d3_svg.line().x(x).y(y);

module.exports = {
  metadata: {
    'version': '1.1',
    'xmlns': 'http://www.w3.org/2000/svg',
    'xmlns:xlink': 'http://www.w3.org/1999/xlink'
  },
  path: {
    arc: d3_svg.arc(),
    symbol: d3_svg.symbol().type(shape).size(size),
    area: function(items) {
      var o = items[0];
      return (o.orient === 'horizontal' ? areah : areav)
        .interpolate(o.interpolate || 'linear')
        .tension(o.tension || 0.7)
        (items);
    },
    line: function(items) {
      var o = items[0];
      return line
        .interpolate(o.interpolate || 'linear')
        .tension(o.tension || 0.7)
        (items);
    },
    resize: function(pathStr, size) {
      var path = parse(pathStr),
          newPath = '',
          command, current, index, i, n, j, m;

      size = Math.sqrt(size);
      for (i=0, n=path.length; i<n; ++i) {
        for (command=path[i], j=0, m=command.length; j<m; ++j) {
          if (command[j] === 'Z') break;
          if ((current = +command[j]) === current) {
            // if number, need to resize
            index = pathStr.indexOf(current);
            newPath += pathStr.substring(0, index) + (current * size);
            pathStr  = pathStr.substring(index + (current+'').length);
          }
        }
      }

      return newPath + 'Z';
    }
  },
  symbolTypes: dl.toMap(d3_svg.symbolTypes),
  textAlign: {
    'left':   'start',
    'center': 'middle',
    'right':  'end'
  },
  textBaseline: {
    'top':    'before-edge',
    'bottom': 'after-edge',
    'middle': 'central'
  },
  styles: {
    'fill':             'fill',
    'fillOpacity':      'fill-opacity',
    'stroke':           'stroke',
    'strokeWidth':      'stroke-width',
    'strokeOpacity':    'stroke-opacity',
    'strokeCap':        'stroke-linecap',
    'strokeDash':       'stroke-dasharray',
    'strokeDashOffset': 'stroke-dashoffset',
    'opacity':          'opacity'
  },
  styleProperties: [
    'fill',
    'fillOpacity',
    'stroke',
    'strokeWidth',
    'strokeOpacity',
    'strokeCap',
    'strokeDash',
    'strokeDashOffset',
    'opacity'
  ]
};


/***/ }),

/***/ "zicW":
/***/ (function(module, exports, __webpack_require__) {

var util = __webpack_require__("zF6n");

var dl = {
  version:    __webpack_require__("NdEd").version,
  load:       __webpack_require__("5AQc"),
  read:       __webpack_require__("YGNx"),
  type:       __webpack_require__("ggRp"),
  Aggregator: __webpack_require__("tGq9"),
  groupby:    __webpack_require__("lkhv"),
  bins:       __webpack_require__("prMK"),
  $bin:       __webpack_require__("qmQ9").$bin,
  histogram:  __webpack_require__("qmQ9").histogram,
  format:     __webpack_require__("GXhC"),
  template:   __webpack_require__("yQql"),
  time:       __webpack_require__("mgrV")
};

util.extend(dl, util);
util.extend(dl, __webpack_require__("3bKu"));
util.extend(dl, __webpack_require__("YsQl"));
util.extend(dl, __webpack_require__("uHQN"));
util.extend(dl, __webpack_require__("gjoU"));
util.extend(dl.format, __webpack_require__("nXcD"));

// backwards-compatible, deprecated API
// will remove in the future
dl.print = {
  table:   dl.format.table,
  summary: dl.format.summary
};

module.exports = dl;


/***/ })

});
//# sourceMappingURL=0.73fe9215b5b7b8588600.js.map