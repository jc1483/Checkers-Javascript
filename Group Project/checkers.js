/*jslint plusplus: true, white: true */
/*global canvas, transform,
        console, document, requestAnimationFrame, Sphere */
/* @author Joshua Conrady */

//Initialize colors to use later
var BLACK  = [0, 0, 0],     WHITE = [1, 1, 1],
YELLOW = [0.95, 0.95, 0],   ORANGE = [1, 0.6, 0],
GREEN =  [0, 0.7, 0],       BLUE = [0, 0.1, 0.8],
RED = [0.8, 0, 0],          OFFWHITE = [0.933, 0.933, 0.933],
GREY = [0.8, 0.8, 0.8],     cv, main;

main = function () {
    "use strict";

    var pm, mvm, vb, nb, animatedScene, frame, sphere, drawSphere,
            drawSpheres, vertices, numVertices, normals, mouseDown;

    // set up canvas and shaders
    cv = canvas("canvas", GREY);
    cv.setupShaders("shader.vert", "shader.frag", "pMatrix",
            "mvMatrix", "position", "color", "normal",
            "nmMatrix", "lightPosition");

    // Create a sphere mesh
    sphere = new Sphere();
    sphere.createPiece();  // recommend 1 - 5 roundness parameter
                                // Usable roundnesses: 0 - 7

    // Add an effect / texture to the sphere. Possibilities listed below:
    // STARS, DARKBALL, DARKSTARS, CHECKERFADE, GOLF
    sphere.addTexture("DARKSTARS");

    // Pass data to buffers
    vertices = sphere.getVertexMesh();
    numVertices = vertices.length / 3;
    normals = sphere.getNormals();
    vb = cv.copyVertexDataToBuffer(vertices);
    nb = cv.copyVertexDataToBuffer(normals);

    // Initialize transform with perspective normalization
    // and viewing transformations.
    pm = transform();
    pm.perspectiveNormalization(1, 1, 9, 11.25);
    pm.translate(0, 0, -10);
    pm.scale(0.25); // only use if using the drawSpheres function
    cv.setPMatrix(pm);

    mvm = transform();
    cv.setMvMatrix(mvm);
    // cv.setLightPosition(-10, 20, 10);
    cv.setLightPosition(-100, 200, 100); // only use for multiple spheres
    // cv.setLightPosition(50, -50, -100); // only use for golf texture

    // Draw a sphere of a specific color. If the color is not specified,
    // the sphere will be drawn white.
    //  colors  -   the color to draw the sphere
    drawSphere = function (color) {
        cv.setMvMatrix(mvm);
        if (color !== undefined) {
            cv.setColor(color);
        } else {
            cv.setColor(WHITE);
        }

        cv.drawFromBuffers(vb, nb, 0, numVertices, "TRIANGLES");
    };

    // Draw an array of seven spheres (the middle being a specified color)
    //  color   -   the color to draw the middle sphere
    drawSpheres = function (color) {
        // Start on the left with a blue sphere
        mvm.translate(-3, 0, 0);
        drawSphere(BLUE);
        // Translate to the right and draw an orange sphere
        mvm.translate(6, 0, 0);
        drawSphere(ORANGE);
        // Draw a yellow sphere at the top
        mvm.translate(-3, -3, 0);
        drawSphere(YELLOW);
        // Draw a red sphere at the bottom
        mvm.translate(0, 6, 0);
        drawSphere(RED);
        // Draw a green sphere in the back
        mvm.translate(0, -3, 3);
        drawSphere(GREEN);
        // Draw an off-white sphere in the front
        mvm.translate(0, 0, -6);
        drawSphere(OFFWHITE);
        // Last, draw a sphere of a specified color in the middle
        // If the color is not specified, the sphere will be drawn white.
        mvm.translate(0, 0, 3);
        drawSphere(color);
    };

    // Specifies an action when the mouse is depressed. In this case,
    // change the position of the light source.
    // e - Mouse event object.
    mouseDown = function (e) {
        var x, y, lp, c;
        c = document.getElementById("canvas");
        x = e.pageX - c.offsetLeft - 1;
        y = e.pageY - c.offsetTop - 1;
        x = (x * 10 / c.width) - 5;
        y = -((y * 10 / c.width) - 5);

        lp = cv.getLightPosition();
        cv.setLightPosition(x + lp[0], y + lp[1], lp[2]);
    };

    // set the mouseDown function to run when the mouse is depressed.
    document.onmousedown = mouseDown;

    // Initialize the animation frame to frame 0.
    frame = 0;

    // Creates an animated scene which displays the spheres and animates them.
    animatedScene = function () {
        var xAngle, yAngle, zAngle, xColor, yColor, zColor, lightLength,
                xLight, yLight, zLight;

        // variables for smooth rotation of sphere
        xAngle = Math.cos(frame / 100);
        yAngle = Math.cos(frame / 70);
        zAngle = Math.cos(frame / 130);

        // fade color
        xColor = (Math.sin(frame / 120) * 0.5) + 0.5;
        yColor = (Math.cos(frame / 150) * 0.5) + 0.5;
        zColor = (Math.cos(frame / 90) * 0.5) + 0.5;

        // rotate sphere
        mvm.preRotateX(xAngle);
        mvm.preRotateY(yAngle);
        mvm.preRotateZ(zAngle);

        // rotate light source
        // lightLength = Math.sqrt(xAngle * xAngle + yAngle * yAngle +
        //         zAngle * zAngle);
        // xLight = xAngle * 10 / lightLength;
        // yLight = yAngle * 10 / lightLength;
        // zLight = zAngle * 10 / lightLength;
        // cv.setLightPosition(xLight, yLight, zLight);

        // clear the canvas
        cv.clear();

        // draw spheres (with the middle of a specific color)
        drawSpheres([xColor, yColor, zColor]);

        // draw single sphere of specific color
        // drawSphere([xColor, yColor, zColor]);

        // increment the animation frame counter
        frame += 1;

        // request another animation frame with callback
        requestAnimationFrame(animatedScene);
    };

    // start the animation.
    animatedScene();
};
