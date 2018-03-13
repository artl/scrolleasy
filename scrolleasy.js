/**
 *
 * Scrolleasy 1.0.0
 * https://github.com/artl/scrolleasy
 *
 * Licensed under the terms of the MIT license.
 *
 **/

(function (root, factory) {
	var settings = window.scrolleasySettings;

	if (typeof define === "function" && define.amd) {
		define([], factory(settings))
	} else if ('object' === typeof exports) {
		module.exports = factory(settings)
	} else {
		root.scrolleasy = factory(settings)
	}
}(this, function (settings) {
	"use strict";
	settings = settings || {};

	var DEFAULTS = {
		frameRate: 150, // [Hz]
		animationTime: 400, // [ms]
		stepSize: 100, // [px]

		// Pulse
		pulseAlgorithm: true,
		pulseScale: 4,
		pulseNormalize: 1,

		// Acceleration
		accelerationDelta: 50,  // 50
		accelerationMax: 3,   // 3

		// Keyboard Settings
		keyboardSupport: true,  // option
		arrowScroll: 50,    // [px]

		// Other
		fixedBackground: true,
		excluded: ''
	};

	// Extending options
	for (var key in DEFAULTS) {
		if (DEFAULTS.hasOwnProperty(key) && !settings.hasOwnProperty(key)) {
			settings[key] = DEFAULTS[key];
		}
	}

	// Other Variables
	var isExcluded = false;
	var isFrame = false;
	var direction = {x: 0, y: 0};
	var initDone = false;
	var root = document.documentElement;
	var activeElement;
	var observer;
	var refreshSize;
	var deltaBuffer = [];
	var isMac = /^Mac/.test(navigator.platform);

	var keyboardKeys = {
		left: 37,
		up: 38,
		right: 39,
		down: 40,
		spacebar: 32,
		pageup: 33,
		pagedown: 34,
		end: 35,
		home: 36
	};
	var arrowKeys = {37: 1, 38: 1, 39: 1, 40: 1};

	/**
	 * INITIALIZE
	 */

	function init() {

		if (initDone || !document.body) return;

		initDone = true;

		var body = document.body;
		var html = document.documentElement;
		var windowHeight = window.innerHeight;
		var scrollHeight = body.scrollHeight;

		// Check whether the document is rendered in quirks mode or standards mode to determine root element
		root = (document.compatMode.indexOf('CSS') >= 0) ? html : body;
		activeElement = body;

		// Add event listener if keyboard support is enabled
		if (settings.keyboardSupport) {
			addEvent('keydown', keydown);
		}

		// Checks if this script is running in a frame
		if (top != self) {
			isFrame = true;
		}

		/**
		 * Safari 10 fixed it, Chrome fixed it in v45:
		 * This fixes a bug where the areas left and right to
		 * the content does not trigger the onmousewheel event
		 * on some pages. e.g.: html, body { height: 100% }
		 */
		else if (isOldSafari &&
			scrollHeight > windowHeight &&
			(body.offsetHeight <= windowHeight ||
				html.offsetHeight <= windowHeight)) {

			var fullPageElem = document.createElement('div');
			fullPageElem.style.cssText = 'position:absolute; z-index:-10000; ' + 'top:0; left:0; right:0; height:' + root.scrollHeight + 'px';
			document.body.appendChild(fullPageElem);

			// DOM changed (throttled) to fix height
			var pendingRefresh;
			refreshSize = function () {
				if (pendingRefresh) return; // could also be: clearTimeout(pendingRefresh);
				pendingRefresh = setTimeout(function () {
					if (isExcluded) return; // could be running after cleanup
					fullPageElem.style.height = '0';
					fullPageElem.style.height = root.scrollHeight + 'px';
					pendingRefresh = null;
				}, 500); // act rarely to stay fast
			};

			setTimeout(refreshSize, 10);

			addEvent('resize', refreshSize);

			var config = {
				attributes: true,
				childList: true,
				characterData: false
			};

			observer = new MutationObserver(refreshSize);
			observer.observe(body, config);

			if (root.offsetHeight <= windowHeight) {
				var clearfix = document.createElement('div');
				clearfix.style.clear = 'both';
				body.appendChild(clearfix);
			}
		}

		// disable fixed background
		if (!settings.fixedBackground && !isExcluded) {
			body.style.backgroundAttachment = 'scroll';
			html.style.backgroundAttachment = 'scroll';
		}
	}

	/**
	 * Scrolling
	 */

	var queue = [];
	var pending = false;
	var lastScroll = Date.now();

	// Pushes scroll actions to the scrolling queue.
	function scrollArray(elem, left, top) {

		directionCheck(left, top);

		if (settings.accelerationMax !== 1) {
			var now = Date.now();
			var elapsed = now - lastScroll;
			if (elapsed < settings.accelerationDelta) {
				var factor = (1 + (50 / elapsed)) / 2;
				if (factor > 1) {
					factor = Math.min(factor, settings.accelerationMax);
					left *= factor;
					top *= factor;
				}
			}
			lastScroll = Date.now();
		}

		// push a scroll command
		queue.push({
			x: left,
			y: top,
			lastX: (left < 0) ? 0.99 : -0.99,
			lastY: (top < 0) ? 0.99 : -0.99,
			start: Date.now()
		});

		// don't act if there's a pending queue
		if (pending) {
			return;
		}

		var scrollWindow = (elem === document.body);

		var step = function () {

			var now = Date.now();
			var scrollX = 0;
			var scrollY = 0;

			for (var i = 0; i < queue.length; i++) {

				var item = queue[i];
				var elapsed = now - item.start;
				var finished = (elapsed >= settings.animationTime);

				// scroll position: [0, 1]
				var position = (finished) ? 1 : elapsed / settings.animationTime;

				// easing [optional]
				if (settings.pulseAlgorithm) {
					position = getPulsePosition(position);
				}

				// only need the difference
				var x = (item.x * position - item.lastX) >> 0;
				var y = (item.y * position - item.lastY) >> 0;

				// add this to the total scrolling
				scrollX += x;
				scrollY += y;

				// update last values
				item.lastX += x;
				item.lastY += y;

				// delete and step back if it's over
				if (finished) {
					queue.splice(i, 1);
					i--;
				}
			}

			// scroll left and top
			if (scrollWindow) {
				window.scrollBy(scrollX, scrollY);
			}
			else {
				if (scrollX) elem.scrollLeft += scrollX;
				if (scrollY) elem.scrollTop += scrollY;
			}

			// clean up if there's nothing left to do
			if (!left && !top) {
				queue = [];
			}

			if (queue.length) {
				requestFrame(step, elem, (1000 / settings.frameRate + 1));
			} else {
				pending = false;
			}
		};

		// start a new queue of actions
		requestFrame(step, elem, 0);
		pending = true;
	}

	/**
	 * Events
	 */

	// Mouse wheel event handler
	function wheel(event) {

		if (!initDone) {
			init();
		}

		var target = event.target;

		// leave early if default action is prevented
		// or it's a zooming event with CTRL
		if (event.defaultPrevented || event.ctrlKey) {
			return true;
		}

		// leave early if document is not yet loaded
		if (document.readyState === "loading") {
			return true;
		}

		// leave embedded content alone (flash & pdf)
		if (isNodeName(activeElement, 'embed') ||
			(isNodeName(target, 'embed') && /\.pdf/i.test(target.src)) ||
			isNodeName(activeElement, 'object') ||
			target.shadowRoot) {
			return true;
		}

		var deltaX = -event.wheelDeltaX || event.deltaX || 0;
		var deltaY = -event.wheelDeltaY || event.deltaY || 0;

		if (isMac) {
			if (event.wheelDeltaX && isDivisible(event.wheelDeltaX, 120)) {
				deltaX = -120 * (event.wheelDeltaX / Math.abs(event.wheelDeltaX));
			}
			if (event.wheelDeltaY && isDivisible(event.wheelDeltaY, 120)) {
				deltaY = -120 * (event.wheelDeltaY / Math.abs(event.wheelDeltaY));
			}
		}

		// use wheelDelta if deltaX/Y is not available
		if (!deltaX && !deltaY) {
			deltaY = -event.wheelDelta || 0;
		}

		// line based scrolling (Firefox mostly)
		if (event.deltaMode === 1) {
			deltaX *= 40;
			deltaY *= 40;
		}

		var overflowing = overflowingAncestor(target);

		// nothing to do if there's no element that's scrollable
		if (!overflowing) {
			// except Chrome iframes seem to eat wheel events, which we need to
			// propagate up, if the iframe has nothing overflowing to scroll
			if (isFrame && isChrome) {
				// change target to iframe element itself for the parent frame
				Object.defineProperty(event, "target", {value: window.frameElement});
				return parent.wheel(event);
			}
			return true;
		}

		// check if it's a touchpad scroll that should be ignored
		if (isTouchpad(deltaY)) {
			return true;
		}

		// scale by step size
		// delta is 120 most of the time
		// synaptics seems to send 1 sometimes
		if (Math.abs(deltaX) > 1.2) {
			deltaX *= settings.stepSize / 120;
		}
		if (Math.abs(deltaY) > 1.2) {
			deltaY *= settings.stepSize / 120;
		}

		scrollArray(overflowing, deltaX, deltaY);
		event.preventDefault();
		scheduleClearCache();
	}

	// Keydown event handler
	function keydown(event) {

		var target = event.target;
		var modifier = event.ctrlKey || event.altKey || event.metaKey ||
			(event.shiftKey && event.keyCode !== keyboardKeys.spacebar);

		// our own tracked active element could've been removed from the DOM
		if (!document.body.contains(activeElement)) {
			activeElement = document.activeElement;
		}

		// do nothing if user is editing text
		// or using a modifier key (except shift)
		// or in a dropdown
		// or inside interactive elements
		var inputNodeNames = /^(textarea|select|embed|object)$/i;
		var buttonTypes = /^(button|submit|radio|checkbox|file|color|image)$/i;
		if (event.defaultPrevented ||
			inputNodeNames.test(target.nodeName) ||
			isNodeName(target, 'input') && !buttonTypes.test(target.type) ||
			isNodeName(activeElement, 'video') ||
			isInsideYoutubeVideo(event) ||
			target.isContentEditable ||
			modifier) {
			return true;
		}

		// [spacebar] should trigger button press, leave it alone
		if ((isNodeName(target, 'button') ||
				isNodeName(target, 'input') && buttonTypes.test(target.type)) &&
			event.keyCode === keyboardKeys.spacebar) {
			return true;
		}

		// [arrwow keys] on radio buttons should be left alone
		if (isNodeName(target, 'input') && target.type == 'radio' &&
			arrowKeys[event.keyCode]) {
			return true;
		}

		var shift, x = 0, y = 0;
		var overflowing = overflowingAncestor(activeElement);

		if (!overflowing) {
			// Chrome iframes seem to eat key events, which we need to
			// propagate up, if the iframe has nothing overflowing to scroll
			return (isFrame && isChrome) ? parent.keydown(event) : true;
		}

		var clientHeight = overflowing.clientHeight;

		if (overflowing == document.body) {
			clientHeight = window.innerHeight;
		}

		switch (event.keyCode) {
			case keyboardKeys.up:
				y = -settings.arrowScroll;
				break;
			case keyboardKeys.down:
				y = settings.arrowScroll;
				break;
			case keyboardKeys.spacebar: // (+ shift)
				shift = event.shiftKey ? 1 : -1;
				y = -shift * clientHeight * 0.9;
				break;
			case keyboardKeys.pageup:
				y = -clientHeight * 0.9;
				break;
			case keyboardKeys.pagedown:
				y = clientHeight * 0.9;
				break;
			case keyboardKeys.home:
				y = -overflowing.scrollTop;
				break;
			case keyboardKeys.end:
				var scroll = overflowing.scrollHeight - overflowing.scrollTop;
				var scrollRemaining = scroll - clientHeight;
				y = (scrollRemaining > 0) ? scrollRemaining + 10 : 0;
				break;
			case keyboardKeys.left:
				x = -settings.arrowScroll;
				break;
			case keyboardKeys.right:
				x = settings.arrowScroll;
				break;
			default:
				return true; // a key we don't care about
		}

		scrollArray(overflowing, x, y);
		event.preventDefault();
		scheduleClearCache();
	}

	// Mousedown event only for updating activeElement
	function mousedown(event) {
		activeElement = event.target;
	}

	/**
	 * Overflow
	 */

	var uniqueID = (function () {
		var i = 0;
		return function (el) {
			return el.uniqueID || (el.uniqueID = i++);
		};
	})();

	var cache = {}; // cleared out after a scrolling session
	var clearCacheTimer;

	function scheduleClearCache() {
		clearTimeout(clearCacheTimer);
		clearCacheTimer = setInterval(function () {
			cache = {};
		}, 1000);
	}

	function setCache(elems, overflowing) {
		for (var i = elems.length; i--;)
			cache[uniqueID(elems[i])] = overflowing;
		return overflowing;
	}

	//  (body)                (root)
	//         | hidden | visible | scroll |  auto  |
	// hidden  |   no   |    no   |   YES  |   YES  |
	// visible |   no   |   YES   |   YES  |   YES  |
	// scroll  |   no   |   YES   |   YES  |   YES  |
	// auto    |   no   |   YES   |   YES  |   YES  |

	function overflowingAncestor(el) {
		var elems = [];
		var body = document.body;
		var rootScrollHeight = root.scrollHeight;
		do {
			var cached = cache[uniqueID(el)];
			if (cached) {
				return setCache(elems, cached);
			}
			elems.push(el);
			if (rootScrollHeight === el.scrollHeight) {
				var topOverflowsNotHidden = overflowNotHidden(root) && overflowNotHidden(body);
				var isOverflowCSS = topOverflowsNotHidden || overflowAutoOrScroll(root);
				if (isFrame && isContentOverflowing(root) ||
					!isFrame && isOverflowCSS) {
					return setCache(elems, getScrollRoot());
				}
			} else if (isContentOverflowing(el) && overflowAutoOrScroll(el)) {
				return setCache(elems, el);
			}
		} while (el = el.parentElement);
	}

	function isContentOverflowing(el) {
		return (el.clientHeight + 10 < el.scrollHeight);
	}

	// typically for <body> and <html>
	function overflowNotHidden(el) {
		var overflow = getComputedStyle(el, '').getPropertyValue('overflow-y');
		return (overflow !== 'hidden');
	}

	// for all other elements
	function overflowAutoOrScroll(el) {
		var overflow = getComputedStyle(el, '').getPropertyValue('overflow-y');
		return (overflow === 'scroll' || overflow === 'auto');
	}

	/**
	 * Helpers
	 */

	function addEvent(type, fn) {
		window.addEventListener(type, fn, false);
	}

	function removeEvent(type, fn) {
		window.removeEventListener(type, fn, false);
	}

	function isNodeName(el, tag) {
		return (el.nodeName || '').toLowerCase() === tag.toLowerCase();
	}

	function directionCheck(x, y) {
		x = (x > 0) ? 1 : -1;
		y = (y > 0) ? 1 : -1;
		if (direction.x !== x || direction.y !== y) {
			direction.x = x;
			direction.y = y;
			queue = [];
			lastScroll = 0;
		}
	}

	var deltaBufferTimer;

	if (window.localStorage && localStorage.SS_deltaBuffer) {
		try { // #46 Safari throws in private browsing for localStorage
			deltaBuffer = localStorage.SS_deltaBuffer.split(',');
		} catch (e) {
		}
	}

	function isTouchpad(deltaY) {
		if (!deltaY) return;
		if (!deltaBuffer.length) {
			deltaBuffer = [deltaY, deltaY, deltaY];
		}
		deltaY = Math.abs(deltaY);
		deltaBuffer.push(deltaY);
		deltaBuffer.shift();
		clearTimeout(deltaBufferTimer);
		deltaBufferTimer = setTimeout(function () {
			try { // #46 Safari throws in private browsing for localStorage
				localStorage.SS_deltaBuffer = deltaBuffer.join(',');
			} catch (e) {
			}
		}, 1000);
		return !allDeltasDivisableBy(120) && !allDeltasDivisableBy(100);
	}

	function isDivisible(n, divisor) {
		return (Math.floor(n / divisor) == n / divisor);
	}

	function allDeltasDivisableBy(divisor) {
		return (isDivisible(deltaBuffer[0], divisor) &&
			isDivisible(deltaBuffer[1], divisor) &&
			isDivisible(deltaBuffer[2], divisor));
	}

	function isInsideYoutubeVideo(event) {
		var elem = event.target;
		var isControl = false;
		if (document.URL.indexOf('www.youtube.com/watch') != -1) {
			do {
				isControl = (elem.classList &&
					elem.classList.contains('html5-video-controls'));
				if (isControl) break;
			} while (elem = elem.parentNode);
		}
		return isControl;
	}

	var requestFrame = (function () {
		return (window.requestAnimationFrame ||
			window.webkitRequestAnimationFrame ||
			window.mozRequestAnimationFrame ||
			function (callback, element, delay) {
				window.setTimeout(callback, delay || (1000 / 60));
			});
	})();

	var MutationObserver = (window.MutationObserver ||
		window.WebKitMutationObserver ||
		window.MozMutationObserver);

	var getScrollRoot = (function () {
		var SCROLL_ROOT;
		return function () {
			if (!SCROLL_ROOT) {
				var dummy = document.createElement('div');
				dummy.style.cssText = 'height:10000px;width:1px;';
				document.body.appendChild(dummy);
				var bodyScrollTop = document.body.scrollTop;
				window.scrollBy(0, 3);
				if (document.body.scrollTop != bodyScrollTop)
					(SCROLL_ROOT = document.body);
				else
					(SCROLL_ROOT = document.documentElement);
				window.scrollBy(0, -3);
				document.body.removeChild(dummy);
			}
			return SCROLL_ROOT;
		};
	})();

	/**
	 * Pulse (http://stereopsis.com/stopping/)
	 */

	function pulse(x) {
		var val, start, expx;

		x = x * settings.pulseScale;
		if (x < 1) {
			// acceleartion
			val = x - (1 - Math.exp(-x));
		} else {
			// tail

			// the previous animation ended here:
			start = Math.exp(-1);
			// simple viscous drag
			x -= 1;
			expx = 1 - Math.exp(-x);
			val = start + (expx * (1 - start));
		}
		return val * settings.pulseNormalize;
	}

	function getPulsePosition(x) {
		if (x >= 1) return 1;
		if (x <= 0) return 0;

		if (settings.pulseNormalize == 1) {
			settings.pulseNormalize /= pulse(1);
		}
		return pulse(x);
	}

	/**
	 * First run
	 */

	var userAgent = window.navigator.userAgent;
	var isEdge = /Edge/.test(userAgent); // thank you MS
	var isChrome = /chrome/i.test(userAgent) && !isEdge;
	var isSafari = /safari/i.test(userAgent) && !isEdge;
	var isMobile = /mobile/i.test(userAgent);
	var isIEWin7 = /Windows NT 6.1/i.test(userAgent) && /rv:11/i.test(userAgent);
	var isOldSafari = isSafari && (/Version\/8/i.test(userAgent) || /Version\/9/i.test(userAgent));
	var isEnabledForBrowser = (isChrome || isSafari || isIEWin7) && !isMobile;

	var wheelEvent;
	if ('onwheel' in document.createElement('div'))
		wheelEvent = 'wheel';
	else if ('onmousewheel' in document.createElement('div'))
		wheelEvent = 'mousewheel';

	if (wheelEvent && isEnabledForBrowser) {
		addEvent(wheelEvent, wheel);
		addEvent('mousedown', mousedown);
		addEvent('load', init);
	}
}));
