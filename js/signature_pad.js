// The main idea and many parts of the code (e.g. drawing variable width Bézier curves) are taken from:
// http://corner.squareup.com/2012/07/smoother-signatures.html

// Implementation of interpolation using cubic Bézier curves is taken from:
// http://benknowscode.wordpress.com/2012/09/14/path-interpolation-using-cubic-bezier-and-control-point-estimation-in-javascript
var SignaturePad = (function (document) {
    var SignaturePad = function (canvas) {
        var self = this;

        this._canvas = canvas;
        this._ctx   = canvas.getContext("2d");
        this._reset();

        // Handle mouse events
        this._mouseButtonDown = false;

        canvas.addEventListener("mousedown", function (event) {
            if (event.which === 1) {
                self._mouseButtonDown = true;
                self._reset();
            }
        });

        canvas.addEventListener("mousemove", function (event) {
            if (self._mouseButtonDown) {
                var point = new Point(event.layerX, event.layerY);
                self._addPoint(point);
            }
        });

        document.addEventListener("mouseup", function (event) {
            if (event.which === 1 && self._mouseButtonDown) {
                self._mouseButtonDown = false;
            }
        });

        // Handle touch events
        canvas.addEventListener("touchstart", function (event) {
            self._reset();
        });

        canvas.addEventListener("touchmove", function (event) {
            // Prevent scrolling;
            event.preventDefault();

            var touch = event.targetTouches[0],
                offset = canvas.getBoundingClientRect(),
                point = new Point(
                    touch.pageX - offset.left,
                    touch.pageY - offset.top
                );

            self._addPoint(point);
        });

        document.addEventListener("touchend", function (event) {
        });
    };

    SignaturePad.VELOCITY_FILTER_WEIGHT = 0.8;

    SignaturePad.prototype.clear = function () {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._reset();
    };

    SignaturePad.prototype.toDataURL = function (imageType, quality) {
        return this._canvas.toDataURL(arguments);
    };

    SignaturePad.prototype._reset = function () {
        this.points = [];
        this.lastVelocity = 0;
        this.lastWidth = 1;
    };

    SignaturePad.prototype._addPoint = function (point) {
        var points = this.points,
            c1, c2, c3, c4,
            curve, velocity, newWidth, i, tmp;

        points.push(point);

        if (points.length > 2) {
            // To make it work with only 3 elements, copy the first one to the beginning.
            if (points.length === 3) points.unshift(points[0]);

            tmp = this._calculateCurveControlPoints(points[0], points[1], points[2]);
            c1 = tmp.c1;
            c2 = tmp.c2;
            tmp = this._calculateCurveControlPoints(points[1], points[2], points[3]);
            c3 = tmp.c1;
            c4 = tmp.c2;
            curve = new Bezier(points[1], c2, c3, points[2]);
            this._addCurve(curve);

            // Remove the first element from the list,
            // so that we always have at most 4 points in s array.
            points.shift();
        }
    };

    SignaturePad.prototype._calculateCurveControlPoints = function (s1, s2, s3) {
        var dx1 = s1.x - s2.x, dy1 = s1.y - s2.y,
            dx2 = s2.x - s3.x, dy2 = s2.y - s3.y,

            m1 = {x: (s1.x + s2.x) / 2.0, y: (s1.y + s2.y) / 2.0},
            m2 = {x: (s2.x + s3.x) / 2.0, y: (s2.y + s3.y) / 2.0},

            l1 = Math.sqrt(dx1*dx1 + dy1*dy1),
            l2 = Math.sqrt(dx2*dx2 + dy2*dy2),

            dxm = (m1.x - m2.x),
            dym = (m1.y - m2.y),

            k = l2 / (l1 + l2),
            cm = {x: m2.x + dxm*k, y: m2.y + dym*k},

            tx = s2.x - cm.x,
            ty = s2.y - cm.y;

        return {
            c1: new Point(m1.x + tx, m1.y + ty),
            c2: new Point(m2.x + tx, m2.y + ty)
        };
    };

    SignaturePad.prototype._addCurve = function (curve) {
        var startPoint = curve.startPoint,
            endPoint = curve.endPoint,
            velocity, newWidth;

        velocity = endPoint.velocityFrom(startPoint);
        velocity = SignaturePad.VELOCITY_FILTER_WEIGHT * velocity
            + (1 - SignaturePad.VELOCITY_FILTER_WEIGHT) * this.lastVelocity;

        newWidth = this._strokeWidth(velocity);
        this._drawCurve(curve, this.lastWidth, newWidth);

        this.lastVelocity = velocity;
        this.lastWidth = newWidth;
    };

    SignaturePad.prototype._drawPoint = function (point) {
        var ctx = this._ctx,
            size = 3;

        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0 , 2 * Math.PI, false);
        ctx.fillStyle = "red";
        ctx.fill();
    };

    SignaturePad.prototype._drawCurve = function (curve, startWidth, endWidth) {
        var ctx = this._ctx,
            drawSteps = 100, // hopefully should be enough in most cases
            widthDelta = endWidth - startWidth,
            width, i, t, tt, ttt, u, uu, uuu, x, y;

        ctx.beginPath();
        ctx.fillStyle = "black";

        for (i = 0; i < drawSteps; i++) {
            // Calculate the Bezier (x, y) coordinate for this step.
            t = i / drawSteps;
            tt = t * t;
            ttt = tt * t;
            u = 1 - t;
            uu = u * u;
            uuu = uu * u;

            x = uuu * curve.startPoint.x;
            x += 3 * uu * t * curve.control1.x;
            x += 3 * u * tt * curve.control2.x;
            x += ttt * curve.endPoint.x;

            y = uuu * curve.startPoint.y;
            y += 3 * uu * t * curve.control1.y;
            y += 3 * u * tt * curve.control2.y;
            y += ttt * curve.endPoint.y;

            width = startWidth + ttt * widthDelta;
            ctx.arc(x, y, width, 0 , 2 * Math.PI, false);
        }

        ctx.fill();
    };

    SignaturePad.prototype._strokeWidth = function (velocity) {
        var maxWidth = 2.5;
        return maxWidth / (velocity + 1);
    };


    var Point = function (x, y) {
        this.x = x;
        this.y = y;
        this.time = new Date().getTime();
    };

    Point.prototype.velocityFrom = function (start) {
        return this.distanceTo(start) / (this.time - start.time);
    };

    Point.prototype.distanceTo = function (start) {
        return Math.sqrt(Math.pow(this.x - start.x, 2) + Math.pow(this.y - start.y, 2));
    };

    var Bezier = function (startPoint, control1, control2, endPoint) {
        this.startPoint = startPoint;
        this.control1 = control1;
        this.control2 = control2;
        this.endPoint = endPoint;
    };

    return SignaturePad;
})(document);