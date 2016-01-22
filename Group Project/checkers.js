/*jslint plusplus: true, white: true */
/*global canvas, transform,
        console, document, requestAnimationFrame, Sphere */
/* @author Joshua Conrady */

//Initialize colors to use later
var BLACK  = [0, 0, 0],     WHITE = [1, 1, 1],
YELLOW = [0.95, 0.95, 0],   ORANGE = [1, 0.6, 0],
GREEN =  [0, 0.7, 0],       BLUE = [0, 0.1, 0.8],
RED = [0.8, 0, 0],          OFFWHITE = [0.933, 0.933, 0.933],
GREY = [0.8, 0.8, 0.8],
SQUARE_VERTICES = [
        -0.5, 0, -0.5,
         0.5, 0, -0.5,
        -0.5, 0, 0.5,
         0.5, 0, 0.5 ],

SQUARE_NORMALS = [
        0,  1,  0,
        0,  1,  0,
        0,  1,  0,
        0,  1,  0 ],

BOARD_VERTICES = [
        -8.225, 0, -8.225,
         8.225, 0, -8.225,
        -8.225, 0,  8.225,
         8.225, 0,  8.225,
        -8.225, -0.5, -8.225,
         8.225, -0.5, -8.225,
        -8.225, -0.5,  8.225,
         8.225, -0.5,  8.225 ],

BOARD_NORMALS = [
        0,  1,  0,
        0,  1,  0,
        0,  1,  0,
        0,  1,  0,
        0, -1,  0,
        0, -1,  0,
        0, -1,  0,
        0, -1,  0 ],

cv, main;

main = function () {
    "use strict";

    var pm, mvm, vb, nb, animatedScene, frame, sphere, drawBoard, drawSquares,
            vertices, numVertices, normals, svb, snb;

    // set up canvas and shaders
    cv = canvas("canvas", GREY);
    cv.setupShaders("shader.vert", "shader.frag", "pMatrix",
            "mvMatrix", "position", "color", "normal",
            "nmMatrix", "lightPosition");

    // Create a sphere mesh
    sphere = new Sphere();
    sphere.createPiece();  // recommend 1 - 5 roundness parameter
                                // Usable roundnesses: 0 - 7

    // Add an effect / texture to the piece. Possibilities listed below:
    // STARS, DARKBALL, DARKSTARS, CHECKERFADE, GOLF
    sphere.addTexture("STARS");

    // Pass data to buffers
    vertices = sphere.getVertexMesh();
    numVertices = vertices.length / 3;
    normals = sphere.getNormals();
    vb = cv.copyVertexDataToBuffer(BOARD_VERTICES);
    svb = cv.copyVertexDataToBuffer(SQUARE_VERTICES);
    nb = cv.copyVertexDataToBuffer(BOARD_NORMALS);
    snb = cv.copyVertexDataToBuffer(SQUARE_NORMALS);

    // Initialize transform with perspective normalization
    // and viewing transformations.
    pm = transform();
    pm.perspectiveNormalization(6, 6, 10, 30);
    // pm.perspectiveNormalization(2, 2, 10, 30);
    pm.translate(0, 0, -20);
    pm.scale(0.75);
    pm.rotateX(45);
    cv.setPMatrix(pm);

    mvm = transform();
    cv.setMvMatrix(mvm);
    cv.setLightPosition(5, 20, 5);

    drawBoard = function () {
        cv.clear();
        cv.setColor(WHITE);
        cv.drawFromBuffers(vb, nb, 0, 8);
    };

    drawSquares = function () {
        mvm.translate(-7.25, 0.05, -7.25);
        cv.setMvMatrix(mvm);
        cv.setColor(RED);
        cv.drawFromBuffers(svb, snb, 0, 4);
    };

    drawBoard();
    drawSquares();
};
