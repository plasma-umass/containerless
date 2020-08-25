
        let containerless = require("containerless");
        let maze =
        [
            [999,   0, 999, 999,   0,   0,   0, 999, 999, 999, 999,   0, 999, 999, 999, 999, 999, 999, 999,   0, 999, 999, 999, 999, 999,   0, 999,   0, 999, 999],
            [999,   0,   0, 999, 999, 999, 999, 999,   0,   0, 999, 999,   0,   0,   0, 999,   0,   0, 999,   0,   0, 999,   0,   0, 999,   0, 999, 999, 999,   0],
            [999, 999,   0, 999,   0,   0,   0,   0,   0,   0,   0, 999, 999, 999,   0, 999,   0,   0, 999,   0,   0, 999,   0, 999, 999,   0, 999,   0, 999,   0],
            [  0, 999,   0, 999, 999, 999,   0, 999, 999,   0, 999, 999,   0, 999,   0, 999, 999,   0, 999,   0, 999, 999,   0, 999,   0,   0, 999,   0, 999, 999],
            [999, 999,   0,   0,   0, 999,   0, 999,   0,   0, 999,   0,   0, 999,   0,   0, 999,   0, 999, 999, 999,   0,   0, 999, 999,   0, 999,   0,   0,   0],
            [999,   0, 999, 999, 999, 999,   0, 999, 999, 999, 999, 999,   0, 999,   0,   0, 999,   0,   0,   0, 999, 999, 999,   0, 999,   0, 999, 999, 999,   0],
            [999,   0, 999,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 999, 999,   0, 999, 999, 999,   0,   0,   0,   0,   0, 999,   0,   0,   0, 999, 999],
            [999, 999, 999,   0,   0, 999, 999, 999, 999, 999, 999, 999, 999,   0, 999,   0,   0,   0, 999, 999, 999, 999, 999,   0, 999, 999, 999,   0,   0, 999],
            [  0,   0,   0, 999, 999, 999,   0,   0,   0,   0,   0,   0,   0,   0, 999, 999, 999, 999,   0,   0,   0,   0, 999,   0,   0,   0, 999, 999,   0, 999],
            [999, 999,   0, 999,   0, 999,   0, 999,   0, 999, 999, 999, 999, 999,   0,   0,   0, 999,   0, 999, 999, 999, 999,   0, 999,   0,   0, 999,   0, 999],
            [  0, 999,   0, 999,   0, 999, 999, 999,   0, 999,   0, 999,   0,   0,   0,   0, 999, 999,   0,   0,   0, 999,   0,   0, 999, 999,   0, 999,   0, 999],
            [999, 999,   0, 999,   0,   0,   0,   0, 999, 999,   0, 999,   0, 999, 999, 999, 999,   0,   0,   0, 999, 999,   0,   0, 999,   0,   0, 999, 999, 999],
            [999,   0,   0, 999,   0,   0, 999, 999, 999,   0,   0, 999, 999, 999,   0,   0,   0,   0, 999, 999, 999,   0, 999, 999, 999,   0,   0,   0, 999,   0],
            [999, 999,   0, 999,   0, 999, 999,   0,   0,   0,   0,   0,   0,   0,   0,   0, 999, 999, 999,   0,   0,   0,   0,   0, 999,   0, 999, 999, 999,   0],
            [  0, 999,   0, 999,   0, 999,   0, 999, 999, 999, 999, 999, 999, 999,   0, 999, 999,   0, 999, 999,   0, 999, 999, 999, 999,   0, 999,   0,   0, 999],
            [999, 999, 999, 999,   0, 999,   0,   0,   0, 999,   0,   0,   0, 999,   0,   0,   0,   0,   0, 999,   0,   0,   0, 999,   0,   0, 999,   0,   0, 999],
            [999,   0, 999,   0,   0, 999, 999, 999,   0, 999, 999, 999,   0, 999, 999, 999, 999, 999,   0, 999,   0, 999, 999, 999,   0, 999, 999,   0,   0, 999],
            [  0,   0, 999, 999, 999,   0,   0, 999, 999,   0,   0, 999,   0,   0,   0,   0,   0, 999, 999, 999,   0,   0, 999,   0,   0, 999,   0,   0, 999, 999],
            [999, 999, 999,   0, 999,   0,   0,   0, 999, 999,   0, 999, 999,   0, 999, 999,   0,   0,   0,   0, 999, 999, 999, 999, 999, 999, 999, 999, 999,   0],
            [999,   0,   0,   0, 999,   0,   0,   0,   0, 999,   0,   0, 999, 999, 999,   0,   0, 999,   0,   0, 999,   0,   0,   0,   0,   0,   0,   0, 999, 999],
            [999, 999, 999,   0,   0, 999, 999, 999,   0, 999, 999, 999,   0,   0, 999, 999,   0, 999, 999, 999, 999,   0, 999, 999, 999, 999,   0,   0,   0, 999],
            [999,   0, 999,   0,   0, 999,   0, 999,   0,   0,   0, 999,   0, 999,   0, 999, 999,   0,   0,   0,   0, 999, 999,   0,   0, 999,   0, 999, 999, 999],
            [999,   0, 999,   0, 999, 999,   0, 999, 999, 999,   0, 999,   0, 999,   0,   0, 999, 999,   0, 999, 999, 999,   0,   0,   0, 999,   0, 999,   0,   0],
            [999,   0, 999, 999, 999,   0, 999, 999,   0,   0,   0, 999,   0, 999,   0,   0,   0, 999, 999, 999,   0, 999, 999,   0, 999, 999,   0, 999,   0, 999],
            [999,   0,   0,   0,   0,   0, 999,   0, 999, 999, 999, 999,   0, 999,   0,   0,   0,   0,   0,   0,   0,   0, 999,   0, 999,   0,   0, 999, 999, 999],
            [999,   0, 999,   0, 999, 999, 999,   0,   0,   0, 999,   0,   0, 999, 999, 999, 999,   0, 999, 999, 999,   0, 999,   0, 999, 999,   0,   0,   0, 999],
            [999, 999, 999,   0, 999,   0, 999, 999,   0, 999, 999,   0,   0, 999,   0,   0, 999, 999, 999,   0, 999, 999,   0,   0,   0, 999, 999, 999,   0, 999],
            [  0, 999,   0,   0, 999,   0,   0,   0,   0, 999,   0, 999, 999, 999, 999, 999,   0,   0,   0,   0,   0, 999, 999, 999,   0, 999,   0, 999,   0, 999],
            [999, 999, 999,   0, 999, 999,   0, 999, 999, 999,   0, 999,   0,   0,   0,   0,   0, 999, 999, 999,   0,   0,   0, 999,   0,   0,   0, 999,   0, 999],
            [999,   0, 999,   0,   0, 999, 999, 999,   0, 999, 999, 999,   0, 999, 999, 999, 999, 999,   0, 999, 999, 999, 999, 999, 999, 999, 999, 999,   0, 999],
        ];

        function resetMaze() {
            for(let i=0; i<maze.length; i++) {
                for(let j=0; j<maze.length; j++) {
                    if(maze[i][j] > 0) {
                        maze[i][j] = 999;
                    }
                }
            }
        }

        function isValidMove(x, y, turn) {
            if ((x > -1) && (y > -1) && (x < maze[0].length) && (y < maze.length)) {
                return (maze[y][x] > 0) && (turn < maze[y][x]);
            } else {
                return false;
            }
        }

        function findShortestPath(x1, y1, x2, y2) {
            let shortest = -1;

            let moves = [[x1, y1, 0], [x1-1, y1, 0], [x1+1, y1, 0], [x1, y1-1, 0], [x1, y1+1, 0]];

            while(moves.length > 0) {
                let nextMove = moves.shift();
                let x = nextMove[0];
                let y = nextMove[1];
                let turn = nextMove[2] + 1;
                if(isValidMove(x, y, turn)) {
                    if(x === x2 && y === y2) {
                        shortest = turn;
                    } else {
                        maze[y][x] = turn;
                        moves.push([x-1, y, turn]);
                        moves.push([x+1, y, turn]);
                        moves.push([x, y-1, turn]);
                        moves.push([x, y+1, turn]);
                    }
                }
            }

            resetMaze();
            return shortest;
        }

        containerless.listen(function(req) {
            let x1 = req.body.x1;
            let y1 = req.body.y1;
            let x2 = req.body.x2;
            let y2 = req.body.y2;
            if(maze[y1][x1] > 0 && maze[y2][x2] > 0) {
                let len = findShortestPath(x1, y1, x2, y2);
                if(len === -1) {
                    containerless.respond("No such path exists!\n");
                } else {
                    containerless.respond(len);
                }
            } else {
                containerless.respond("Invalid starting conditions.");
            }
        });