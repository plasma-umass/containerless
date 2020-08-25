
        let containerless = require("containerless");
        let words = [
            "time",
            "year",
            "people",
            "way",
            "day",
            "man",
            "thing",
            "woman",
            "life",
            "child",
            "world",
            "school",
            "state",
            "family",
            "student",
            "group",
            "country",
            "problem",
            "hand",
            "part",
            "place",
            "case",
            "week",
            "company",
            "system",
            "program",
            "question",
            "work",
            "government",
            "number",
            "night",
            "point",
            "home",
            "water",
            "room",
            "mother",
            "area",
            "money",
            "story",
            "fact",
            "month",
            "lot",
            "right",
            "study",
            "book",
            "eye",
            "job",
            "word",
            "business",
            "issue",
            "side",
            "kind",
            "head",
            "house",
            "service",
            "friend",
            "father",
            "power",
            "hour",
            "game",
            "line",
            "end",
            "member",
            "law",
            "car",
            "city",
            "community",
            "name",
            "president",
            "team",
            "minute",
            "idea",
            "kid",
            "body",
            "information",
            "back",
            "parent",
            "face",
            "others",
            "level",
            "office",
            "door",
            "health",
            "person",
            "art",
            "war",
            "history",
            "party",
            "result",
            "change",
            "morning",
            "reason",
            "research",
            "girl",
            "guy",
            "moment",
            "air",
            "teacher",
            "force",
            "education",
        ];

        containerless.listen(function(req) {
            let matches = [];
            for(let i=0; i<words.length; i = i + 1) {
                let word = words[i];
                if((req.path.length > 1) && word.length >= (req.path.length - 1)) {
                    let x = "/" + words[i];
                    let match = x.startsWith(req.path);
                    if(match) {
                        matches.push(word);
                    }
                }
            }
            if(matches.length === 0) {
                containerless.respond("No matches found!");
            } else {
                containerless.respond(matches);
            }
        });