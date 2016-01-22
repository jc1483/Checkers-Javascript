/*jslint browser: true,
         devel: true,
         bitwise: true,
         plusplus: true,
         white: true */
/*global Float32Array */

var TRANSPOSE = true;  // Transpose matrices before sending them
                       // to the vertex shader?  (Since GLSL will
                       // interpret them in column-major order.)

// To keep track of light position accross transforms
var lightPosition = [];


// tf (optional) - transform object providing initial values.
//                 (If not specified, new transform will start
//                 with identity matrix.)
//
// Create a transform object:  a wrapper around a 16-value array
// representing a 4x4 transformation matrix with various functions
// for conveniently modifying the transformation.
var transform = function (tf) {
    "use strict";

    var pb = {}, pv = {};

    if (tf === undefined) {
        pv.values = [ 1, 0, 0, 0,
                      0, 1, 0, 0,
                      0, 0, 1, 0,
                      0, 0, 0, 1 ];
    } else {
        pv.values = tf.slice(0);
    }

    pv.history = [];

    // Save a copy of the current transformation matrix on the
    // matrix stack.
    pb.push = function () {
        pv.history.push(pv.values.slice(0));
    };

    // Undo changes since last push.  (And pop last push, so
    // that another pop would retrieve what had been pushed
    // before that.)
    pb.pop = function () {
        pv.values = pv.history.pop();
    };

    // b - transform object (or array with 16 values) to multiply
    //     pv.values by.
    // pre - If true, flip the order of the operands, so that the
    //       matrices are pre-multiplied rather than post-
    //       multiplied.
    //
    // Multiply the 4x4 matrix represented by pv.values by the
    // matrix represented by b.  Copy the result to pv.values.
    pb.multiplyBy = function (b, pre) {
        var result, i, j, k, aVals, bVals;

        aVals = pv.values;

        if (b.getValues === undefined) {
            bVals = b;
        } else {
            bVals = b.getValues();
        }

        result = [ 0, 0, 0, 0,
                   0, 0, 0, 0,
                   0, 0, 0, 0,
                   0, 0, 0, 0 ];

        for (i = 0; i < 4; i++) {
            for (j = 0; j < 4; j++) {
                for (k = 0; k < 4; k++) {
                    if (pre === undefined) {
                        result[i * 4 + j] += aVals[i * 4 + k] *
                                bVals[k * 4 + j];
                    } else {
                        result[i * 4 + j] += bVals[i * 4 + k] *
                                aVals[k * 4 + j];
                    }
                }
            }
        }

        for (i = 0; i < 16; i++) {
            aVals[i] = result[i];
        }
    };
    pb.preMultiplyBy = function (b) {
        pb.multiplyBy(b, true);
    };

    // x - x coordinate of vertex to transform.
    // y - y coordinate of vertex to transform.
    // z - z coordinate of vertex to transform.
    //
    // Return transformed vertex as a 3-element array.  Works with
    // three values or a single three-value array argument.
    pb.transformVertex = function (x, y, z) {
        var m = pv.values, w;

        if (y === undefined) {
            y = x[1];
            z = x[2];
            x = x[0];
        }

        w = m[12]*x + m[13]*y + m[14]*z + m[15];

        return [ (m[0]*x + m[1]*y + m[ 2]*z + m[ 3]) / w,
                 (m[4]*x + m[5]*y + m[ 6]*z + m[ 7]) / w,
                 (m[8]*x + m[9]*y + m[10]*z + m[11]) / w ];
    };

    // tx - x translation amount.
    // ty - y translation amount.
    // tz - z translation amount.
    // pre - If true, create composite transformation with
    //       translation preceding current transformation.
    //
    // Start with current transformation, add a translation. (If
    // only one argument, it should be an array with tx, ty and
    // tz values.  But if you want to use pre, you need three
    // separate arguments for tx, ty and tz.  Or you can use
    // preTranslate, defined below.)
    pb.translate = function (tx, ty, tz, pre) {

        if (ty === undefined) {
            ty = tx[1];
            tz = tx[2];
            tx = tx[0];
        }

        pb.multiplyBy([ 1, 0, 0, tx,
                        0, 1, 0, ty,
                        0, 0, 1, tz,
                        0, 0, 0, 1 ], pre);
    };
    pb.preTranslate = function (tx, ty, tz) {

        if (ty === undefined) {
            ty = tx[1];
            tz = tx[2];
            tx = tx[0];
        }

        pb.translate(tx, ty, tz, true);
    };

    // sx - x translation amount.
    // sy - y translation amount.
    // sz - z translation amount.
    // pre - If true, create composite transformation with scale
    //       preceding current transformation.
    //
    // Start with current transformation, add a scale.  (If only
    // one argument, it will be used for sx, sy and sz.  But if
    // you want to use pre, you need all three.  Or you can use
    // preScale, defined below.)
    pb.scale = function (sx, sy, sz, pre) {

        if (sy === undefined) {
            sy = sz = sx;
        }

        pb.multiplyBy([ sx, 0,  0,  0,
                        0,  sy, 0,  0,
                        0,  0,  sz, 0,
                        0,  0,  0,  1 ], pre);
    };
    pb.preScale = function (sx, sy, sz) {

        if (sy === undefined) {
            sy = sz = sx;
        }

        pb.scale(sx, sy, sz, true);
    };

    // v - Vertex to which transformation should be applied
    //         (as array with three values).
    //
    // Applies current transformation to a vertex and returns
    // the resulting vertex.
    pb.applyTo = function (v) {
        var m = pv.values, x, y, z, w;

        w = m[12]*v[0] + m[13]*v[1] + m[14]*v[2] + m[15];
        x = (m[0]*v[0] + m[1]*v[1] + m[2]*v[2] + m[3]) / w;
        y = (m[4]*v[0] + m[5]*v[1] + m[6]*v[2] + m[7]) / w;
        z = (m[8]*v[0] + m[9]*v[1] + m[10]*v[2] + m[11]) / w;

        return [x, y, z];
    };

    pb.inverse = function () {
        var inv, det, m, valStr = pv.values.toString();

        if (valStr === pv.cachedInverseValStr) {
            return transform(pv.cachedInverse);
        }

        inv = [];
        m = pv.values;

        inv[ 0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                   m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                   m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        inv[ 4] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                   m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                   m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        inv[ 8] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                   m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                   m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        inv[12] = -m[ 4]*m[ 9]*m[14] + m[ 4]*m[10]*m[13] +
                   m[ 8]*m[ 5]*m[14] - m[ 8]*m[ 6]*m[13] -
                   m[12]*m[ 5]*m[10] + m[12]*m[ 6]*m[ 9];

        det = m[0] * inv[0] + m[1] * inv[ 4] +
              m[2] * inv[8] + m[3] * inv[12];

        if (det === 0) {
            return undefined;
        }

        inv[ 0] = inv[ 0] / det;
        inv[ 4] = inv[ 4] / det;
        inv[ 8] = inv[ 8] / det;
        inv[12] = inv[12] / det;

        inv[ 1] = (-m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                    m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                    m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10]) / det;

        inv[ 5] = ( m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                    m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                    m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10]) / det;

        inv[ 9] = (-m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                    m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                    m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9]) / det;

        inv[13] = ( m[ 0]*m[ 9]*m[14] - m[ 0]*m[10]*m[13] -
                    m[ 8]*m[ 1]*m[14] + m[ 8]*m[ 2]*m[13] +
                    m[12]*m[ 1]*m[10] - m[12]*m[ 2]*m[ 9]) / det;

        inv[ 2] = ( m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                    m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                    m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6]) / det;

        inv[ 6] = (-m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                    m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                    m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6]) / det;

        inv[10] = ( m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                    m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                    m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5]) / det;

        inv[14] = (-m[ 0]*m[ 5]*m[14] + m[ 0]*m[ 6]*m[13] +
                    m[ 4]*m[ 1]*m[14] - m[ 4]*m[ 2]*m[13] -
                    m[12]*m[ 1]*m[ 6] + m[12]*m[ 2]*m[ 5]) / det;

        inv[ 3] = (-m[ 1]*m[ 6]*m[11] + m[ 1]*m[ 7]*m[10] +
                    m[ 5]*m[ 2]*m[11] - m[ 5]*m[ 3]*m[10] -
                    m[ 9]*m[ 2]*m[ 7] + m[ 9]*m[ 3]*m[ 6]) / det;

        inv[ 7] = ( m[ 0]*m[ 6]*m[11] - m[ 0]*m[ 7]*m[10] -
                    m[ 4]*m[ 2]*m[11] + m[ 4]*m[ 3]*m[10] +
                    m[ 8]*m[ 2]*m[ 7] - m[ 8]*m[ 3]*m[ 6]) / det;

        inv[11] = (-m[ 0]*m[ 5]*m[11] + m[ 0]*m[ 7]*m[ 9] +
                    m[ 4]*m[ 1]*m[11] - m[ 4]*m[ 3]*m[ 9] -
                    m[ 8]*m[ 1]*m[ 7] + m[ 8]*m[ 3]*m[ 5]) / det;

        inv[15] = ( m[ 0]*m[ 5]*m[10] - m[ 0]*m[ 6]*m[ 9] -
                    m[ 4]*m[ 1]*m[10] + m[ 4]*m[ 2]*m[ 9] +
                    m[ 8]*m[ 1]*m[ 6] - m[ 8]*m[ 2]*m[ 5]) / det;

        pv.cachedInverseValStr = valStr;
        pv.cachedInverse = inv;

        return transform(inv);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the x axis.
    pb.rotateX = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ 1, 0,  0, 0,
                        0, c, -s, 0,
                        0, s,  c, 0,
                        0, 0,  0, 1 ], pre);
    };
    pb.preRotateX = function (a) {
        pb.rotateX(a, true);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the z axis.
    pb.rotateY = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ c, 0, s, 0,
                        0, 1, 0, 0,
                       -s, 0, c, 0,
                        0, 0, 0, 1 ], pre);
    };
    pb.preRotateY = function (a) {
        pb.rotateY(a, true);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the z axis.
    pb.rotateZ = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ c, -s, 0, 0,
                        s,  c, 0, 0,
                        0,  0, 1, 0,
                        0,  0, 0, 1 ], pre);
    };
    pb.preRotateZ = function (a) {
        pb.rotateZ(a, true);
    };

    // r - Distance, on near plane, from center to RIGHT side
    //     clipping plane.
    // t - Distance, on near plane, from center to TOP clipping
    //     plane.
    // n - Distance from origin (i.e., view point) to NEAR plane.
    // f - Distance from origin (i.e., view point) to FAR plane.
    //
    // Start with current transformation, add a transformation
    // to get from right-handed (not necessarily square)
    // rectangular frustum to left-handed WebGL canonical view
    // volume.
    pb.perspectiveNormalization = function (r, t, n, f) {
        pb.multiplyBy(
                [ n/r, 0,   0,           0,
                  0,   n/t, 0,           0,
                  0,   0,   (n+f)/(n-f), 2*n*f/(n-f),
                  0,   0,  -1,           0 ]);
    };

    // eye - View ("eye") position in scene.
    // target - Position (in scene) view direction is pointing
    //          toward.
    // up - Up direction in scene.
    //
    // Originally based on example code from
    // http://www.opengl.org/wiki/GluLookAt_code
    //
    // Start with current transformation; add a viewing
    // transformation specified in terms of where the viewer is
    // and what they're looking at.  (This is especially useful
    // if you are doing lighting calculations and need to know the
    // eye position in scene coordinates.)
    pb.lookAt = function (eye, target, up) {
        var normalize, d, s;

        normalize = function (v) {
            var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] +
                    v[2] * v[2]);
            v[0] = v[0] / len;
            v[1] = v[1] / len;
            v[2] = v[2] / len;
        };

        // Direction (d) = normalize(target - eye).
        d = [];
        d[0] = target[0] - eye[0];
        d[1] = target[1] - eye[1];
        d[2] = target[2] - eye[2];
        normalize(d);

        // Side (s) = normalize(cross-product of d and up).
        normalize(up);
        s = [];
        s[0] = d[1] * up[2] - d[2] * up[1];
        s[1] = d[2] * up[0] - d[0] * up[2];
        s[2] = d[0] * up[1] - d[1] * up[0];
        normalize(s);

        // Recompute up as cross product of s and d.  (Projects up
        // onto camera plane.)
        up[0] = s[1] * d[2] - s[2] * d[1];
        up[1] = s[2] * d[0] - s[0] * d[2];
        up[2] = s[0] * d[1] - s[1] * d[0];

        // Multiply by rotation matrix based on basis vectors s,
        // up and d. Multiply current transformation matrix by this
        // one.
        pb.multiplyBy([  s[0],  s[1],  s[2], 0,
                        up[0], up[1], up[2], 0,
                        -d[0], -d[1], -d[2], 0,
                            0,     0,     0, 1 ]);

        // Translate eye away from the origin.
        pb.translate(-eye[0], -eye[1], -eye[2]);
    };

    // Originally based on gluInvertMatrixd function, from Mesa
    // 9.0.0, which credits David Moore.
    // ftp://ftp.freedesktop.org/pub/mesa/glu/glu-9.0.0.tar.gz
    // (glu-9.0.0/src/libutil/project.c)
    //
    // This version is reformatted and refactored a bit, to make
    // it clearer that it works by finding the adjugate matrix
    // and then dividing each term by the determinant.  If
    // the determinant is zero (i.e., the matrix doesn't have an
    // inverse), it will print an error message in the console
    // but leave the current transformation matrix unchanged.
    // Otherwise, it will invert the current transformation matrix.
    pb.invert = function () {
        var adj = [], det, i, m = pv.values;

        adj[ 0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                   m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                   m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        adj[ 4] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                   m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                   m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        adj[ 8] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                   m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                   m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        adj[12] = -m[ 4]*m[ 9]*m[14] + m[ 4]*m[10]*m[13] +
                   m[ 8]*m[ 5]*m[14] - m[ 8]*m[ 6]*m[13] -
                   m[12]*m[ 5]*m[10] + m[12]*m[ 6]*m[ 9];

        det = m[0] * adj[0] + m[1] * adj[ 4] +
              m[2] * adj[8] + m[3] * adj[12];

        if (det === 0) {
            console.log("Can't invert that matrix!");

        } else {
            adj[ 1] = -m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                       m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                       m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10];

            adj[ 2] =  m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                       m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                       m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6];

            adj[ 3] = -m[ 1]*m[ 6]*m[11] + m[ 1]*m[ 7]*m[10] +
                       m[ 5]*m[ 2]*m[11] - m[ 5]*m[ 3]*m[10] -
                       m[ 9]*m[ 2]*m[ 7] + m[ 9]*m[ 3]*m[ 6];

            adj[ 5] =  m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                       m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                       m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10];

            adj[ 6] = -m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                       m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                       m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6];

            adj[ 7] =  m[ 0]*m[ 6]*m[11] - m[ 0]*m[ 7]*m[10] -
                       m[ 4]*m[ 2]*m[11] + m[ 4]*m[ 3]*m[10] +
                       m[ 8]*m[ 2]*m[ 7] - m[ 8]*m[ 3]*m[ 6];

            adj[ 9] = -m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                       m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                       m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9];

            adj[10] =  m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                       m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                       m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5];

            adj[11] = -m[ 0]*m[ 5]*m[11] + m[ 0]*m[ 7]*m[ 9] +
                       m[ 4]*m[ 1]*m[11] - m[ 4]*m[ 3]*m[ 9] -
                       m[ 8]*m[ 1]*m[ 7] + m[ 8]*m[ 3]*m[ 5];

            adj[13] =  m[ 0]*m[ 9]*m[14] - m[ 0]*m[10]*m[13] -
                       m[ 8]*m[ 1]*m[14] + m[ 8]*m[ 2]*m[13] +
                       m[12]*m[ 1]*m[10] - m[12]*m[ 2]*m[ 9];

            adj[14] = -m[ 0]*m[ 5]*m[14] + m[ 0]*m[ 6]*m[13] +
                       m[ 4]*m[ 1]*m[14] - m[ 4]*m[ 2]*m[13] -
                       m[12]*m[ 1]*m[ 6] + m[12]*m[ 2]*m[ 5];

            adj[15] =  m[ 0]*m[ 5]*m[10] - m[ 0]*m[ 6]*m[ 9] -
                       m[ 4]*m[ 1]*m[10] + m[ 4]*m[ 2]*m[ 9] +
                       m[ 8]*m[ 1]*m[ 6] - m[ 8]*m[ 2]*m[ 5];

            for (i = 0; i < 16; i++) {
                pv.values[i] = adj[i] / det;
            }
        }
    };

    // Returns the normal matrix associated with the current
    // transformation.  (The normal matrix is the transpose of the
    // upper left 3x3 portion of the adjugate.)
    pb.getNormalMatrix = function () {
        var n = [], m = pv.values;

        // adj[0]
        n[0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        // adj[1]
        n[3] = -m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10];

        // adj[2]
        n[6] =  m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6];

        // adj[4]
        n[1] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        // adj[5]
        n[4] =  m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10];

        // adj[6]
        n[7] = -m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6];

        // adj[8]
        n[2] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        // adj[9]
        n[5] = -m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9];

        // adj[10]
        n[8] =  m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5];

        return n;
    };

    // Return copy of values representing current transformation
    // matrix.
    pb.getValues = function () {
        return pv.values.slice(0);  // slice(0) makes a copy of
                                    // the array.
    };

    // Print matrix values to Javascript console (for testing).
    pb.printValues = function (d) {
        var i;

        if (d === undefined) {
            d = 2;
        }

        for (i = 0; i < 4; i++) {
            console.log(pv.values[i * 4].toFixed(d) + "  " +
                    pv.values[i * 4 + 1].toFixed(d) + "  " +
                    pv.values[i * 4 + 2].toFixed(d) + "  " +
                    pv.values[i * 4 + 3].toFixed(d));
        }

        console.log("");
    };

    return pb;
};

// id - HTML file canvas element's id.
// clearColor (optional) - Color to use when clearing the canvas.
//            (If not specified, will be black.)
//
// Create a canvas object--a wrapper providing simplified access
// to WebGL.  (The structure of this function represents an
// attempt to create something which, from the outside is as
// class-like as possible but internally uses Javascript
// prototype-style objects.  And, based on Crockford's advice,
// it's defined in such a way that you don't use "new" when
// you create an instance.)
var canvas = function (id, clearColor) {
    "use strict";

    var pb = {}, pv = {};

    pv.gl = document.getElementById(id).getContext(
            "experimental-webgl");
    pv.gl.enable(pv.gl.DEPTH_TEST);

    if (clearColor === undefined) {
        pv.gl.clearColor(0, 0, 0, 1);
    } else {
        pv.gl.clearColor(
                clearColor[0], clearColor[1], clearColor[2], 1);
    }

    // url - URL (from same domain) to read from.
    //
    // Returns text from URL (or server error message text).
    pv.readFromUrl = function (url) {
        var request = new XMLHttpRequest();

        request.open("GET", url, false);   // "false" here means
        request.send();                    // the request is
                                           // synchronous.
        return request.responseText;
    };

    // shaderProgram - Shader program object returned by
    //                 gl.createProgram.
    // shader - Shader object returned by gl.createShader.
    // url - Shader source code URL (from same domain).
    //
    // Reports compilation errors in console.
    pv.attachShader = function (shaderProgram, shader, url) {
        pv.gl.shaderSource(shader, pv.readFromUrl(url));
        pv.gl.compileShader(shader);

        if (pv.gl.getShaderParameter(shader,
                pv.gl.COMPILE_STATUS) === false) {
            console.log('Error compiling shader "' + url + '": ' +
                    pv.gl.getShaderInfoLog(shader));
        } else {
            pv.gl.attachShader(shaderProgram, shader);
        }
    };

    // vertexShaderUrl - URL (from same domain) for vertex shader
    //                   source code.
    // fragmentShaderUrl - URL (from same domain) for fragment
    //                     shader source code.
    // pMatrixUniformVarName - Name of projection (perspective
    //                         normalization) transformation
    //                         uniform variable in vertex shader.
    // mvMatrixUniformVarName - Name of model / view transformation
    //                          uniform variable in vertex shader.
    // positionAttributeVarName - Name of position attribute
    //                            variable in vertex shader.
    // colorUniformVarName - Name of color uniform variable in
    //                       fragment shader.
    // normalAttributeVarName (optional) - Name of normal attribute
    //                        variable in vertex shader.
    // normalMatrixUniformVarName (optional) - Name of normal
    //                            matrix uniform...
    // lightPosUniformVarName (optional) - Name of light position
    //                        uniform...
    //
    // Creates a new private field for each attribute or uniform
    // variable.  (The last three arguments are optional, but you
    // if you have one you need all three.)
    pb.setupShaders = function (vertexShaderUrl,
            fragmentShaderUrl, pMatrixUniformVarName,
            mvMatrixUniformVarName, positionAttributeVarName,
            colorUniformVarName, normalAttributeVarName,
            normalMatrixUniformVarName, lightPosUniformVarName) {
        var shaderProgram = pv.gl.createProgram();

        pv.attachShader(shaderProgram,
                pv.gl.createShader(pv.gl.VERTEX_SHADER),
                vertexShaderUrl);
        pv.attachShader(shaderProgram,
                pv.gl.createShader(pv.gl.FRAGMENT_SHADER),
                fragmentShaderUrl);
        pv.gl.linkProgram(shaderProgram);
        pv.gl.useProgram(shaderProgram);

        pv.pMatrixUniform = pv.gl.getUniformLocation(
                shaderProgram, pMatrixUniformVarName);
        pv.mvMatrixUniform = pv.gl.getUniformLocation(
                shaderProgram, mvMatrixUniformVarName);
        pv.positionAttribute = pv.gl.getAttribLocation(
                shaderProgram, positionAttributeVarName);
        pv.gl.enableVertexAttribArray(pv.positionAttribute);
        pv.colorUniform = pv.gl.getUniformLocation(
                shaderProgram, colorUniformVarName);

        if (normalAttributeVarName !== undefined) {
            pv.lighting = true;
            pv.normalAttribute = pv.gl.getAttribLocation(
                    shaderProgram, normalAttributeVarName);
            pv.gl.enableVertexAttribArray(pv.normalAttribute);
            pv.normalMatrixUniform = pv.gl.getUniformLocation(
                    shaderProgram, normalMatrixUniformVarName);
            pv.lightPosUniform = pv.gl.getUniformLocation(
                    shaderProgram, lightPosUniformVarName);
        }
    };

    // vertexData - Array with vertex coordinates (three values
    //              per vertex).
    //
    // Returns reference to buffer.
    pb.copyVertexDataToBuffer = function (vertexData) {
        var buffer = pv.gl.createBuffer();

        pv.gl.bindBuffer(pv.gl.ARRAY_BUFFER, buffer);
        pv.gl.bufferData(pv.gl.ARRAY_BUFFER,
                new Float32Array(vertexData), pv.gl.STATIC_DRAW);

        return buffer;
    };

    // Clears the canvas (using clear color set above).
    pb.clear = function () {
        pv.gl.clear(pv.gl.COLOR_BUFFER_BIT |
                pv.gl.DEPTH_BUFFER_BIT);
    };

    // m - Transformation matrix, as either Javascript
    //     array or transform object, as defined below.
    //
    // Sets projection (perspective normalization)
    // transformation matrix.
    pb.setPMatrix = function (m) {

        if (m.getValues !== undefined) {
            m = m.getValues();
        }

        if (TRANSPOSE) {
            m = [ m[0], m[4], m[ 8], m[12],
                  m[1], m[5], m[ 9], m[13],
                  m[2], m[6], m[10], m[14],
                  m[3], m[7], m[11], m[15] ];
        }

        pv.gl.uniformMatrix4fv(pv.pMatrixUniform, false,
                new Float32Array(m));
    };

    // m - Transformation matrix, as either Javascript
    //     array or transform object, as defined below.
    //
    // Sets model / view transformation matrix.  If setupShaders
    // was called with the last four optional arguments (for
    // lighting), this function will also set the normal matrix
    // based on the model / view matrix.
    pb.setMvMatrix = function (m) {
        var n;

        if (m.getValues !== undefined) {
            pv.mvMatrix = m;

            if (pv.lighting !== undefined) {
                n = m.getNormalMatrix();
            }

            m = m.getValues();

        } else {
            pv.mvMatrix = transform(m);

            if (pv.lighting !== undefined) {
                n = pv.mvMatrix.getNormalMatrix();
            }
        }

        if (TRANSPOSE) {
            m = [ m[0], m[4], m[ 8], m[12],
                  m[1], m[5], m[ 9], m[13],
                  m[2], m[6], m[10], m[14],
                  m[3], m[7], m[11], m[15] ];

            if (pv.lighting !== undefined) {
                n = [ n[0], n[3], n[6],
                      n[1], n[4], n[7],
                      n[2], n[5], n[8] ];
            }
        }

        pv.gl.uniformMatrix4fv(pv.mvMatrixUniform, false,
                new Float32Array(m));

        if (pv.lighting !== undefined) {
            pv.gl.uniformMatrix3fv(pv.normalMatrixUniform, false,
                new Float32Array(n));
        }
    };

    // r - Red component of new color.
    // g - Green component of new color.
    // b - Blue component of new color.
    //
    // Sets color.  (Assumes setupShaders has already been called.)
    pb.setColor = function (r, g, b) {

        if (g === undefined) {
            pv.gl.uniform3f(pv.colorUniform, r[0], r[1], r[2]);
        } else {
            pv.gl.uniform3f(pv.colorUniform, r, g, b);
        }
    };

    // x - x coordinate of light position.
    // y - y coordinate of light position.
    // z - z coordinate of light position.
    //
    // Sets light position.  May be called with three values or
    // a single three-value array argument.  Transforms light
    // position to eye coordinates based on current model / view
    // transformation (unless none has been set yet, in which
    // case it assumes the light position is already in eye
    // coordinates).
    pb.setLightPosition = function (x, y, z) {
        var v;

        if (y === undefined) {
            y = x[1];
            z = x[2];
            x = x[0];
        }

        if (pv.mvMatrix !== undefined) {
            v = pv.mvMatrix.transformVertex(x, y, z);
            x = v[0];
            y = v[1];
            z = v[2];
        }

        lightPosition = [x, y, z];
        pv.gl.uniform3f(pv.lightPosUniform, x, y, z);
    };

    pb.getLightPosition = function () {
        return lightPosition;
    };

    // buffer - Buffer object returned by copyVertexDatatoBuffer.
    // offset - How many vertices from the beginning of the buffer
    //          is the first vertex?
    // numberOfVertices - How many vertices in the shape?
    // modeString (optional) - "TRIANGLE_STRIP", "TRIANGLE_FAN",
    //            etc.  ("TRIANGLE_STRIP" is default.)
    //
    // Draws shapes represented by vertices in the buffer.  If
    // setupShaders was called with last three optional arguments
    // (for lighting), assumes buffer includes six values per
    // vertex: x, y, z, and then the normal's x, y and z.
    pb.drawFromBuffer = function (buffer, offset,
            numberOfVertices, modeString) {
        var mode = pv.gl.TRIANGLE_STRIP;

        if (modeString === "LINE_LOOP") {
            mode = pv.gl.LINE_LOOP;
        } else if (modeString === "LINES") {
            mode = pv.gl.LINES;
        } else if (modeString === "TRIANGLE_FAN") {
            mode = pv.gl.TRIANGLE_FAN;
        } else if (modeString === "TRIANGLES") {
            mode = pv.gl.TRIANGLES;
        }

        pv.gl.bindBuffer(pv.gl.ARRAY_BUFFER, buffer);

        if (pv.lighting === undefined) {
            pv.gl.vertexAttribPointer(pv.positionAttribute, 3,
                    pv.gl.FLOAT, false, 12, 0);
        } else {
            pv.gl.vertexAttribPointer(pv.positionAttribute, 3,
                    pv.gl.FLOAT, false, 24, 0);
            pv.gl.vertexAttribPointer(pv.positionAttribute, 3,
                    pv.gl.FLOAT, false, 24, 12);
        }

        pv.gl.drawArrays(mode, offset, numberOfVertices);
    };

    // Another version of drawFromBuffer, but allows you to send
    // normals via a second buffer.
    pb.drawFromBuffers = function(vertexBuffer, normalBuffer,
            offset, numberOfVertices, modeString) {
        var mode = pv.gl.TRIANGLE_STRIP;

        if (modeString === "LINE_LOOP") {
            mode = pv.gl.LINE_LOOP;
        } else if (modeString === "LINES") {
            mode = pv.gl.LINES;
        } else if (modeString === "TRIANGLE_FAN") {
            mode = pv.gl.TRIANGLE_FAN;
        } else if (modeString === "TRIANGLES") {
            mode = pv.gl.TRIANGLES;
        }

        pv.gl.bindBuffer(pv.gl.ARRAY_BUFFER, vertexBuffer);
        pv.gl.vertexAttribPointer(pv.positionAttribute, 3,
                pv.gl.FLOAT, false, 12, 0);
        pv.gl.bindBuffer(pv.gl.ARRAY_BUFFER, normalBuffer);
        pv.gl.vertexAttribPointer(pv.normalAttribute, 3,
                pv.gl.FLOAT, false, 12, 0);

        pv.gl.drawArrays(mode, offset, numberOfVertices);
    };

    // Return a reference to the container object holding public
    // members.  Note that, if a method from pb is called via
    // the reference returned here, it will have access to
    // per-object copies of the private members in the pv
    // container object.
    return pb;
};

// tf (optional) - transform object providing initial values.
//                 (If not specified, new transform will start
//                 with identity matrix.)
//
// Create a transform object:  a wrapper around a 16-value array
// representing a 4x4 transformation matrix with various functions
// for conveniently modifying the transformation.
var transform = function (tf) {
    "use strict";

    var pb = {}, pv = {};

    if (tf === undefined) {
        pv.values = [ 1, 0, 0, 0,
                      0, 1, 0, 0,
                      0, 0, 1, 0,
                      0, 0, 0, 1 ];
    } else {
        pv.values = tf.slice(0);
    }

    pv.history = [];

    // Save a copy of the current transformation matrix on the
    // matrix stack.
    pb.push = function () {
        pv.history.push(pv.values.slice(0));
    };

    // Undo changes since last push.  (And pop last push, so
    // that another pop would retrieve what had been pushed
    // before that.)
    pb.pop = function () {
        pv.values = pv.history.pop();
    };

    // b - transform object (or array with 16 values) to multiply
    //     pv.values by.
    // pre - If true, flip the order of the operands, so that the
    //       matrices are pre-multiplied rather than post-
    //       multiplied.
    //
    // Multiply the 4x4 matrix represented by pv.values by the
    // matrix represented by b.  Copy the result to pv.values.
    pb.multiplyBy = function (b, pre) {
        var result, i, j, k, aVals, bVals;

        aVals = pv.values;

        if (b.getValues === undefined) {
            bVals = b;
        } else {
            bVals = b.getValues();
        }

        result = [ 0, 0, 0, 0,
                   0, 0, 0, 0,
                   0, 0, 0, 0,
                   0, 0, 0, 0 ];

        for (i = 0; i < 4; i++) {
            for (j = 0; j < 4; j++) {
                for (k = 0; k < 4; k++) {
                    if (pre === undefined) {
                        result[i * 4 + j] += aVals[i * 4 + k] *
                                bVals[k * 4 + j];
                    } else {
                        result[i * 4 + j] += bVals[i * 4 + k] *
                                aVals[k * 4 + j];
                    }
                }
            }
        }

        for (i = 0; i < 16; i++) {
            aVals[i] = result[i];
        }
    };
    pb.preMultiplyBy = function (b) {
        pb.multiplyBy(b, true);
    };

    // x - x coordinate of vertex to transform.
    // y - y coordinate of vertex to transform.
    // z - z coordinate of vertex to transform.
    //
    // Return transformed vertex as a 3-element array.  Works with
    // three values or a single three-value array argument.
    pb.transformVertex = function (x, y, z) {
        var m = pv.values, w;

        if (y === undefined) {
            y = x[1];
            z = x[2];
            x = x[0];
        }

        w = m[12]*x + m[13]*y + m[14]*z + m[15];

        return [ (m[0]*x + m[1]*y + m[ 2]*z + m[ 3]) / w,
                 (m[4]*x + m[5]*y + m[ 6]*z + m[ 7]) / w,
                 (m[8]*x + m[9]*y + m[10]*z + m[11]) / w ];
    };

    // tx - x translation amount.
    // ty - y translation amount.
    // tz - z translation amount.
    // pre - If true, create composite transformation with
    //       translation preceding current transformation.
    //
    // Start with current transformation, add a translation. (If
    // only one argument, it should be an array with tx, ty and
    // tz values.  But if you want to use pre, you need three
    // separate arguments for tx, ty and tz.  Or you can use
    // preTranslate, defined below.)
    pb.translate = function (tx, ty, tz, pre) {

        if (ty === undefined) {
            ty = tx[1];
            tz = tx[2];
            tx = tx[0];
        }

        pb.multiplyBy([ 1, 0, 0, tx,
                        0, 1, 0, ty,
                        0, 0, 1, tz,
                        0, 0, 0, 1 ], pre);
    };
    pb.preTranslate = function (tx, ty, tz) {

        if (ty === undefined) {
            ty = tx[1];
            tz = tx[2];
            tx = tx[0];
        }

        pb.translate(tx, ty, tz, true);
    };

    // sx - x translation amount.
    // sy - y translation amount.
    // sz - z translation amount.
    // pre - If true, create composite transformation with scale
    //       preceding current transformation.
    //
    // Start with current transformation, add a scale.  (If only
    // one argument, it will be used for sx, sy and sz.  But if
    // you want to use pre, you need all three.  Or you can use
    // preScale, defined below.)
    pb.scale = function (sx, sy, sz, pre) {

        if (sy === undefined) {
            sy = sz = sx;
        }

        pb.multiplyBy([ sx, 0,  0,  0,
                        0,  sy, 0,  0,
                        0,  0,  sz, 0,
                        0,  0,  0,  1 ], pre);
    };
    pb.preScale = function (sx, sy, sz) {

        if (sy === undefined) {
            sy = sz = sx;
        }

        pb.scale(sx, sy, sz, true);
    };

    // v - Vertex to which transformation should be applied
    //         (as array with three values).
    //
    // Applies current transformation to a vertex and returns
    // the resulting vertex.
    pb.applyTo = function (v) {
        var m = pv.values, x, y, z, w;

        w = m[12]*v[0] + m[13]*v[1] + m[14]*v[2] + m[15];
        x = (m[0]*v[0] + m[1]*v[1] + m[2]*v[2] + m[3]) / w;
        y = (m[4]*v[0] + m[5]*v[1] + m[6]*v[2] + m[7]) / w;
        z = (m[8]*v[0] + m[9]*v[1] + m[10]*v[2] + m[11]) / w;

        return [x, y, z];
    };

    pb.inverse = function () {
        var inv, det, m, valStr = pv.values.toString();

        if (valStr === pv.cachedInverseValStr) {
            return transform(pv.cachedInverse);
        }

        inv = [];
        m = pv.values;

        inv[ 0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                   m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                   m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        inv[ 4] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                   m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                   m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        inv[ 8] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                   m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                   m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        inv[12] = -m[ 4]*m[ 9]*m[14] + m[ 4]*m[10]*m[13] +
                   m[ 8]*m[ 5]*m[14] - m[ 8]*m[ 6]*m[13] -
                   m[12]*m[ 5]*m[10] + m[12]*m[ 6]*m[ 9];

        det = m[0] * inv[0] + m[1] * inv[ 4] +
              m[2] * inv[8] + m[3] * inv[12];

        if (det === 0) {
            return undefined;
        }

        inv[ 0] = inv[ 0] / det;
        inv[ 4] = inv[ 4] / det;
        inv[ 8] = inv[ 8] / det;
        inv[12] = inv[12] / det;

        inv[ 1] = (-m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                    m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                    m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10]) / det;

        inv[ 5] = ( m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                    m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                    m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10]) / det;

        inv[ 9] = (-m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                    m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                    m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9]) / det;

        inv[13] = ( m[ 0]*m[ 9]*m[14] - m[ 0]*m[10]*m[13] -
                    m[ 8]*m[ 1]*m[14] + m[ 8]*m[ 2]*m[13] +
                    m[12]*m[ 1]*m[10] - m[12]*m[ 2]*m[ 9]) / det;

        inv[ 2] = ( m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                    m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                    m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6]) / det;

        inv[ 6] = (-m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                    m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                    m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6]) / det;

        inv[10] = ( m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                    m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                    m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5]) / det;

        inv[14] = (-m[ 0]*m[ 5]*m[14] + m[ 0]*m[ 6]*m[13] +
                    m[ 4]*m[ 1]*m[14] - m[ 4]*m[ 2]*m[13] -
                    m[12]*m[ 1]*m[ 6] + m[12]*m[ 2]*m[ 5]) / det;

        inv[ 3] = (-m[ 1]*m[ 6]*m[11] + m[ 1]*m[ 7]*m[10] +
                    m[ 5]*m[ 2]*m[11] - m[ 5]*m[ 3]*m[10] -
                    m[ 9]*m[ 2]*m[ 7] + m[ 9]*m[ 3]*m[ 6]) / det;

        inv[ 7] = ( m[ 0]*m[ 6]*m[11] - m[ 0]*m[ 7]*m[10] -
                    m[ 4]*m[ 2]*m[11] + m[ 4]*m[ 3]*m[10] +
                    m[ 8]*m[ 2]*m[ 7] - m[ 8]*m[ 3]*m[ 6]) / det;

        inv[11] = (-m[ 0]*m[ 5]*m[11] + m[ 0]*m[ 7]*m[ 9] +
                    m[ 4]*m[ 1]*m[11] - m[ 4]*m[ 3]*m[ 9] -
                    m[ 8]*m[ 1]*m[ 7] + m[ 8]*m[ 3]*m[ 5]) / det;

        inv[15] = ( m[ 0]*m[ 5]*m[10] - m[ 0]*m[ 6]*m[ 9] -
                    m[ 4]*m[ 1]*m[10] + m[ 4]*m[ 2]*m[ 9] +
                    m[ 8]*m[ 1]*m[ 6] - m[ 8]*m[ 2]*m[ 5]) / det;

        pv.cachedInverseValStr = valStr;
        pv.cachedInverse = inv;

        return transform(inv);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the x axis.
    pb.rotateX = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ 1, 0,  0, 0,
                        0, c, -s, 0,
                        0, s,  c, 0,
                        0, 0,  0, 1 ], pre);
    };
    pb.preRotateX = function (a) {
        pb.rotateX(a, true);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the z axis.
    pb.rotateY = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ c, 0, s, 0,
                        0, 1, 0, 0,
                       -s, 0, c, 0,
                        0, 0, 0, 1 ], pre);
    };
    pb.preRotateY = function (a) {
        pb.rotateY(a, true);
    };

    // a - Rotation angle in degrees.
    // pre - If true, create composite transformation with rotation
    //       preceding current transformation.
    //
    // Start with current transformation, add a counter-clockwise
    // rotation about the z axis.
    pb.rotateZ = function (a, pre) {
        var r, s, c;

        r = Math.PI * a / 180;
        s = Math.sin(r);
        c = Math.cos(r);

        pb.multiplyBy([ c, -s, 0, 0,
                        s,  c, 0, 0,
                        0,  0, 1, 0,
                        0,  0, 0, 1 ], pre);
    };
    pb.preRotateZ = function (a) {
        pb.rotateZ(a, true);
    };

    // r - Distance, on near plane, from center to RIGHT side
    //     clipping plane.
    // t - Distance, on near plane, from center to TOP clipping
    //     plane.
    // n - Distance from origin (i.e., view point) to NEAR plane.
    // f - Distance from origin (i.e., view point) to FAR plane.
    //
    // Start with current transformation, add a transformation
    // to get from right-handed (not necessarily square)
    // rectangular frustum to left-handed WebGL canonical view
    // volume.
    pb.perspectiveNormalization = function (r, t, n, f) {
        pb.multiplyBy(
                [ n/r, 0,   0,           0,
                  0,   n/t, 0,           0,
                  0,   0,   (n+f)/(n-f), 2*n*f/(n-f),
                  0,   0,  -1,           0 ]);
    };

    // eye - View ("eye") position in scene.
    // target - Position (in scene) view direction is pointing
    //          toward.
    // up - Up direction in scene.
    //
    // Originally based on example code from
    // http://www.opengl.org/wiki/GluLookAt_code
    //
    // Start with current transformation; add a viewing
    // transformation specified in terms of where the viewer is
    // and what they're looking at.  (This is especially useful
    // if you are doing lighting calculations and need to know the
    // eye position in scene coordinates.)
    pb.lookAt = function (eye, target, up) {
        var normalize, d, s;

        normalize = function (v) {
            var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] +
                    v[2] * v[2]);
            v[0] = v[0] / len;
            v[1] = v[1] / len;
            v[2] = v[2] / len;
        };

        // Direction (d) = normalize(target - eye).
        d = [];
        d[0] = target[0] - eye[0];
        d[1] = target[1] - eye[1];
        d[2] = target[2] - eye[2];
        normalize(d);

        // Side (s) = normalize(cross-product of d and up).
        normalize(up);
        s = [];
        s[0] = d[1] * up[2] - d[2] * up[1];
        s[1] = d[2] * up[0] - d[0] * up[2];
        s[2] = d[0] * up[1] - d[1] * up[0];
        normalize(s);

        // Recompute up as cross product of s and d.  (Projects up
        // onto camera plane.)
        up[0] = s[1] * d[2] - s[2] * d[1];
        up[1] = s[2] * d[0] - s[0] * d[2];
        up[2] = s[0] * d[1] - s[1] * d[0];

        // Multiply by rotation matrix based on basis vectors s,
        // up and d. Multiply current transformation matrix by this
        // one.
        pb.multiplyBy([  s[0],  s[1],  s[2], 0,
                        up[0], up[1], up[2], 0,
                        -d[0], -d[1], -d[2], 0,
                            0,     0,     0, 1 ]);

        // Translate eye away from the origin.
        pb.translate(-eye[0], -eye[1], -eye[2]);
    };

    // Originally based on gluInvertMatrixd function, from Mesa
    // 9.0.0, which credits David Moore.
    // ftp://ftp.freedesktop.org/pub/mesa/glu/glu-9.0.0.tar.gz
    // (glu-9.0.0/src/libutil/project.c)
    //
    // This version is reformatted and refactored a bit, to make
    // it clearer that it works by finding the adjugate matrix
    // and then dividing each term by the determinant.  If
    // the determinant is zero (i.e., the matrix doesn't have an
    // inverse), it will print an error message in the console
    // but leave the current transformation matrix unchanged.
    // Otherwise, it will invert the current transformation matrix.
    pb.invert = function () {
        var adj = [], det, i, m = pv.values;

        adj[ 0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                   m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                   m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        adj[ 4] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                   m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                   m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        adj[ 8] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                   m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                   m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        adj[12] = -m[ 4]*m[ 9]*m[14] + m[ 4]*m[10]*m[13] +
                   m[ 8]*m[ 5]*m[14] - m[ 8]*m[ 6]*m[13] -
                   m[12]*m[ 5]*m[10] + m[12]*m[ 6]*m[ 9];

        det = m[0] * adj[0] + m[1] * adj[ 4] +
              m[2] * adj[8] + m[3] * adj[12];

        if (det === 0) {
            console.log("Can't invert that matrix!");

        } else {
            adj[ 1] = -m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                       m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                       m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10];

            adj[ 2] =  m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                       m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                       m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6];

            adj[ 3] = -m[ 1]*m[ 6]*m[11] + m[ 1]*m[ 7]*m[10] +
                       m[ 5]*m[ 2]*m[11] - m[ 5]*m[ 3]*m[10] -
                       m[ 9]*m[ 2]*m[ 7] + m[ 9]*m[ 3]*m[ 6];

            adj[ 5] =  m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                       m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                       m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10];

            adj[ 6] = -m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                       m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                       m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6];

            adj[ 7] =  m[ 0]*m[ 6]*m[11] - m[ 0]*m[ 7]*m[10] -
                       m[ 4]*m[ 2]*m[11] + m[ 4]*m[ 3]*m[10] +
                       m[ 8]*m[ 2]*m[ 7] - m[ 8]*m[ 3]*m[ 6];

            adj[ 9] = -m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                       m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                       m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9];

            adj[10] =  m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                       m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                       m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5];

            adj[11] = -m[ 0]*m[ 5]*m[11] + m[ 0]*m[ 7]*m[ 9] +
                       m[ 4]*m[ 1]*m[11] - m[ 4]*m[ 3]*m[ 9] -
                       m[ 8]*m[ 1]*m[ 7] + m[ 8]*m[ 3]*m[ 5];

            adj[13] =  m[ 0]*m[ 9]*m[14] - m[ 0]*m[10]*m[13] -
                       m[ 8]*m[ 1]*m[14] + m[ 8]*m[ 2]*m[13] +
                       m[12]*m[ 1]*m[10] - m[12]*m[ 2]*m[ 9];

            adj[14] = -m[ 0]*m[ 5]*m[14] + m[ 0]*m[ 6]*m[13] +
                       m[ 4]*m[ 1]*m[14] - m[ 4]*m[ 2]*m[13] -
                       m[12]*m[ 1]*m[ 6] + m[12]*m[ 2]*m[ 5];

            adj[15] =  m[ 0]*m[ 5]*m[10] - m[ 0]*m[ 6]*m[ 9] -
                       m[ 4]*m[ 1]*m[10] + m[ 4]*m[ 2]*m[ 9] +
                       m[ 8]*m[ 1]*m[ 6] - m[ 8]*m[ 2]*m[ 5];

            for (i = 0; i < 16; i++) {
                pv.values[i] = adj[i] / det;
            }
        }
    };

    // Returns the normal matrix associated with the current
    // transformation.  (The normal matrix is the transpose of the
    // upper left 3x3 portion of the adjugate.)
    pb.getNormalMatrix = function () {
        var n = [], m = pv.values;

        // adj[0]
        n[0] =  m[ 5]*m[10]*m[15] - m[ 5]*m[11]*m[14] -
                m[ 9]*m[ 6]*m[15] + m[ 9]*m[ 7]*m[14] +
                m[13]*m[ 6]*m[11] - m[13]*m[ 7]*m[10];

        // adj[1]
        n[3] = -m[ 1]*m[10]*m[15] + m[ 1]*m[11]*m[14] +
                m[ 9]*m[ 2]*m[15] - m[ 9]*m[ 3]*m[14] -
                m[13]*m[ 2]*m[11] + m[13]*m[ 3]*m[10];

        // adj[2]
        n[6] =  m[ 1]*m[ 6]*m[15] - m[ 1]*m[ 7]*m[14] -
                m[ 5]*m[ 2]*m[15] + m[ 5]*m[ 3]*m[14] +
                m[13]*m[ 2]*m[ 7] - m[13]*m[ 3]*m[ 6];

        // adj[4]
        n[1] = -m[ 4]*m[10]*m[15] + m[ 4]*m[11]*m[14] +
                m[ 8]*m[ 6]*m[15] - m[ 8]*m[ 7]*m[14] -
                m[12]*m[ 6]*m[11] + m[12]*m[ 7]*m[10];

        // adj[5]
        n[4] =  m[ 0]*m[10]*m[15] - m[ 0]*m[11]*m[14] -
                m[ 8]*m[ 2]*m[15] + m[ 8]*m[ 3]*m[14] +
                m[12]*m[ 2]*m[11] - m[12]*m[ 3]*m[10];

        // adj[6]
        n[7] = -m[ 0]*m[ 6]*m[15] + m[ 0]*m[ 7]*m[14] +
                m[ 4]*m[ 2]*m[15] - m[ 4]*m[ 3]*m[14] -
                m[12]*m[ 2]*m[ 7] + m[12]*m[ 3]*m[ 6];

        // adj[8]
        n[2] =  m[ 4]*m[ 9]*m[15] - m[ 4]*m[11]*m[13] -
                m[ 8]*m[ 5]*m[15] + m[ 8]*m[ 7]*m[13] +
                m[12]*m[ 5]*m[11] - m[12]*m[ 7]*m[ 9];

        // adj[9]
        n[5] = -m[ 0]*m[ 9]*m[15] + m[ 0]*m[11]*m[13] +
                m[ 8]*m[ 1]*m[15] - m[ 8]*m[ 3]*m[13] -
                m[12]*m[ 1]*m[11] + m[12]*m[ 3]*m[ 9];

        // adj[10]
        n[8] =  m[ 0]*m[ 5]*m[15] - m[ 0]*m[ 7]*m[13] -
                m[ 4]*m[ 1]*m[15] + m[ 4]*m[ 3]*m[13] +
                m[12]*m[ 1]*m[ 7] - m[12]*m[ 3]*m[ 5];

        return n;
    };

    // Return copy of values representing current transformation
    // matrix.
    pb.getValues = function () {
        return pv.values.slice(0);  // slice(0) makes a copy of
                                    // the array.
    };

    // Print matrix values to Javascript console (for testing).
    pb.printValues = function (d) {
        var i;

        if (d === undefined) {
            d = 2;
        }

        for (i = 0; i < 4; i++) {
            console.log(pv.values[i * 4].toFixed(d) + "  " +
                    pv.values[i * 4 + 1].toFixed(d) + "  " +
                    pv.values[i * 4 + 2].toFixed(d) + "  " +
                    pv.values[i * 4 + 3].toFixed(d));
        }

        console.log("");
    };

    return pb;
};
