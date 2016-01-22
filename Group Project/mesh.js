/*jslint white: true */
/*global hasOwnProperty, console */

/* @author Joshua Conrady

        ***DISCLAIMER***
    CODE INFLUENCED BY AUTHOR OF WEBPAGE:
    http://blog.andreaskahler.com/2009/06/creating-icosphere-mesh-in-code.html
*/

var Sphere;

// Creates a sphere "mesh" or group of vertices which, when drawn by openGL,
// will represent a sphere on screen.
Sphere = function () {
    "use strict";
    // public and private objects
    var pb = {}, pv = {};

    // stores vertices of the sphere
    pv.vertices = [];
    // stores faces as an array of triangles (which are arrays of vertices)
    pv.faces = [];
    // stores normal vectors to the vertices
    pv.normals = [];

    // Adds a vertex to the list of vertices. Checks to make sure the vertex is
    // on the unit circle before adding.
    //  x   -   the x coordinate of the vertex
    //  y   -   the y coordinate of the vertex
    //  z   -   the z coordinate of the vertex
    pv.addVertex = function (x, y, z) {
        var length = Math.sqrt(x * x + y * y + z * z);
        pv.vertices.push([x / length, y / length, z / length]);
    };

    // Adds a face to the list of faces based upon the three vertices passed
    // to the function.
    //  one -   the first vertex of the triangle face
    //  two -   the second vertex of the triangle face
    //  three - the third vertex of the triangle face
    pv.addFace = function (one, two, three) {
        pv.faces.push([one, two, three]);
    };

    // Finds the midpoint between two vertices. Puts the midpoint onto the
    // unit sphere.
    //  a   -   the first vertex
    //  b   -   the second vertex
    pv.getMidPoint = function (a, b) {
        var mid, length;
        mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        length = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]);
        return [mid[0] / length, mid[1] / length, mid[2] / length];

    };

    // Creates the initial Icosahedron required to generate the sphere.
    //
    // First, creates 12 vertices equivalent to the 12 corners of three
    // orthogonal squares with sides of length one (x, y, z planes).
    //
    // Then adds faces to the image by adding vertices of triangles around
    // the already present 12 vertices.
    pv.createIcosahedron = function () {
        // create 12 vertices
        var t;

        // Golden Ratio
        t = (1.0 + Math.sqrt(5.0)) / 2.0;

        // z = 0 vertices (form a rectangle parallel to xy plane)
        pv.addVertex(-1,  t, 0);
        pv.addVertex( 1,  t, 0);
        pv.addVertex(-1, -t, 0);
        pv.addVertex( 1, -t, 0);

        // x = 0 vertices (form a rectangle parallel to yz plane)
        pv.addVertex( 0, -1,  t);
        pv.addVertex( 0,  1,  t);
        pv.addVertex( 0, -1, -t);
        pv.addVertex( 0,  1, -t);

        // y = 0 vertices (form a rectangle parallel to xz plane)
        pv.addVertex( t,  0, -1);
        pv.addVertex( t,  0,  1);
        pv.addVertex(-t,  0, -1);
        pv.addVertex(-t,  0,  1);

        // create 20 triangular faces of the icosahedron

        // five faces around vertex 0
        pv.addFace(pv.vertices[0],  pv.vertices[11], pv.vertices[5]);
        pv.addFace(pv.vertices[0],  pv.vertices[5],  pv.vertices[1]);
        pv.addFace(pv.vertices[0],  pv.vertices[1],  pv.vertices[7]);
        pv.addFace(pv.vertices[0],  pv.vertices[7],  pv.vertices[10]);
        pv.addFace(pv.vertices[0],  pv.vertices[10], pv.vertices[11]);

        // five adjacent faces
        pv.addFace(pv.vertices[1],  pv.vertices[5],  pv.vertices[9]);
        pv.addFace(pv.vertices[5],  pv.vertices[11], pv.vertices[4]);
        pv.addFace(pv.vertices[11], pv.vertices[10], pv.vertices[2]);
        pv.addFace(pv.vertices[10], pv.vertices[7],  pv.vertices[6]);
        pv.addFace(pv.vertices[7],  pv.vertices[1],  pv.vertices[8]);

        // five faces around vertex 3
        pv.addFace(pv.vertices[3],  pv.vertices[9],  pv.vertices[4]);
        pv.addFace(pv.vertices[3],  pv.vertices[4],  pv.vertices[2]);
        pv.addFace(pv.vertices[3],  pv.vertices[2],  pv.vertices[6]);
        pv.addFace(pv.vertices[3],  pv.vertices[6],  pv.vertices[8]);
        pv.addFace(pv.vertices[3],  pv.vertices[8],  pv.vertices[9]);

        // five adjacent face
        pv.addFace(pv.vertices[4],  pv.vertices[9],  pv.vertices[5]);
        pv.addFace(pv.vertices[2],  pv.vertices[4],  pv.vertices[11]);
        pv.addFace(pv.vertices[6],  pv.vertices[2],  pv.vertices[10]);
        pv.addFace(pv.vertices[8],  pv.vertices[6],  pv.vertices[7]);
        pv.addFace(pv.vertices[9],  pv.vertices[8],  pv.vertices[1]);
    };

    // Refines the already present triangular faces of the icosahedron /
    // icosphere. Creates vertices at the midpoints of all the already present
    // triangles' sides and connects them. Thus, four triangles are created
    // from one.
    //  recursionLevel  -   the number of times to recursively refine
    //                          the triangles (affects icosphere roundness).
    pv.refineTriangles = function (recursionLevel) {
        var faces2, tri, i, j, a, b, c;

        for (i = 0; i < recursionLevel; i += 1) {

            faces2 = [];

            for (j = 0; j < pv.faces.length; j += 1) {
                tri = pv.faces[j];
                // replace triangle by 4 triangles
                a = pv.getMidPoint(tri[0], tri[1]);
                b = pv.getMidPoint(tri[1], tri[2]);
                c = pv.getMidPoint(tri[2], tri[0]);

                faces2.push([tri[0], a, c]);
                faces2.push([tri[1], b, a]);
                faces2.push([tri[2], c, b]);
                faces2.push([a, b, c]);
            }
            pv.faces = faces2;
        }
    };

    // Calculates the cross product of two vectors (used to calculate normals).
    //  a   -   the first vector
    //  b   -   the second vector
    pv.crossProduct = function (a, b) {
        var x, y, z;
        x = (a[1] * b[2]) - (a[2] * b[1]);
        y = (a[2] * b[0]) - (a[0] * b[2]);
        z = (a[0] * b[1]) - (a[1] * b[0]);

        return [x, y, z];
    };

    // Calculates the dot product of two vectors (used to calculate normals).
    //  a   -   the first vector
    //  b   -   the second vector
    pv.dotProduct = function (a, b) {
        var x, y, z;

        x = a[0] * b[0];
        y = a[1] * b[1];
        z = a[2] * b[2];

        return x + y + z;
    };

    // Calculates the scalar product of a vector and number.
    //  num     -   the number
    //  vec     -   the vector
    pv.scalarProduct = function (num, vec) {
        vec[0] *= num;
        vec[1] *= num;
        vec[2] *= num;

        return vec;
    };

    // Sets the normal vectors for each vertex and adds them to the
    // normal array.
    pv.setNormals = function () {
        var i, j, k, edge1 = [], edge2 = [], tri, thisNormal;

        for (i = 0; i < pv.faces.length; i += 1) {
            tri = pv.faces[i];
            for (j = 0; j < 3; j += 1) {
                edge1[j] = tri[1][j] - tri[0][j];
                edge2[j] = tri[2][j] - tri[1][j];
            }

            thisNormal = pv.crossProduct(edge1, edge2);
            for (k = 0; k < 3; k += 1) {
                for (j = 0; j < 3; j += 1) {
                    pv.normals.push(thisNormal[j]);
                }
            }
        }
    };

    pv.flatten = function () {
        var i, j;

        for (i = 0; i < pv.faces.length; i += 1) {
            for (j = 0; j < 3; j += 1) {
                if (pv.faces[i][j][1] > 0.3) {
                    pv.faces[i][j][1] = 0.3;
                }
                if (pv.faces[i][j][1] < -0.3) {
                    pv.faces[i][j][1] = -0.3;
                }
            }
        }

        // for (i = 1; i < pv.normals.length; i += 3) {
        //     if (pv.normals[i] > 0.3) {
        //         pv.normals[i] = 0.3;
        //     }
        //     if (pv.normals[i] < -0.3) {
        //         pv.normals[i] = -0.3;
        //     }
        // }
    };

    // Public method to create an icosphere based on the roundness parameter.
    //  roundness   -   affects the recursion level of the refinement
    pb.createSphere = function (roundness) {
        pv.createIcosahedron();
        pv.refineTriangles(roundness);
        pv.setNormals();
    };

    // Public method to create a cyclindrical / flat checker piece.
    pb.createPiece = function () {
        pv.createIcosahedron();
        pv.refineTriangles(4);
        pv.flatten();
        pv.setNormals();
    };


    // Returns a list of vertices (passed to the vertex buffer)
    pb.getVertexMesh = function () {
        var i, j, k, vertexList = [];

        for (i = 0; i < pv.faces.length; i += 1) {
            for (j = 0; j < 3; j += 1) {
                for (k = 0; k < 3; k += 1) {
                    vertexList.push(pv.faces[i][j][k]);
                }
            }
        }

        return vertexList;
    };

    // Returns the list of normal vectors to each vertex (passed to the
    // normal buffer)
    pb.getNormals = function () {
        return pv.normals;
    };

    // Public function used to add built in textures to the sphere.
    //  texture     -   the name of the texture to be added to the sphere
    pb.addTexture = function (texture) {
        var i, j, k, middle, vector, nByL, product;

        if (texture === "STARS") {
            for (i = 0; i < pv.normals.length; i += 12) {
                middle = pv.normals[i + 9];

                for (j = 0; j < 9; j += 1) {
                    pv.normals[i] = pv.crossProduct(pv.normals[i], middle);
                }
            }
        } else if (texture === "DARKBALL") {
            for (i = 0; i < pv.normals.length; i += 12) {
                for (j = 0; j < 9; j += 1) {
                    pv.normals[i + j] = -pv.normals[i + j];
                }
            }
        } else if (texture === "DARKSTARS") {
            for (i = 0; i < pv.normals.length; i += 12) {
                middle = pv.normals[i + 9];
                for (j = 0; j < 9; j += 1) {
                    pv.normals[i] = pv.normals[i] + middle;
                }
            }
        } else if (texture === "CHECKERFADE") {
            for (i = 0; i < pv.normals.length; i += 36) {
                for (j = 0; j < 27; j += 1) {
                    pv.normals[i + j] = 0.1;
                }
            }
        } else if (texture === "GOLF") {
            for (i = 0; i < pv.normals.length; i += 36) {
                middle = [pv.normals[33], pv.normals[34],
                        pv.normals[35]];

                for (j = 0; j < 27; j += 3) {
                    vector = [pv.normals[i + j], pv.normals[i + j + 1],
                            pv.normals[i + j + 2]];
                    nByL = pv.dotProduct(middle, vector);
                    product = 2 * nByL;
                    product = pv.scalarProduct(product, middle);

                    for (k = 0; k < 3; k += 1) {
                        pv.normals[i + j + k] = product[k] - vector[k];
                    }
                }
            }
        }
    };

    return pb;
};
