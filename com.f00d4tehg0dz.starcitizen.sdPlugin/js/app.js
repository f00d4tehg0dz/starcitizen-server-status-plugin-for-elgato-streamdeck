let intervals = {};
    if ($SD) {
        const actionName = "com.f00d4tehg0dz.starcitizen.action";

        $SD.on("connected", function (jsonObj) {
            console.log("Connected!13");
      
        });
        
        $SD.on(actionName + ".willAppear", function (jsonObj) {
            let settings = jsonObj.payload.settings;
            if(settings.automaticRefresh){
                initiateStatus(jsonObj.context, jsonObj.payload.settings);
            }  
        });

        $SD.on(actionName + ".sendToPlugin", function (jsonObj) {
            $SD.api.setSettings(jsonObj.context, jsonObj.payload);
            initiateStatus(jsonObj.context, jsonObj.payload);
        });

        // When pressed, TeslaFi status gets updated!
        $SD.on(actionName + ".keyUp", function (jsonObj) {
          
            initiateStatus(jsonObj.context, jsonObj.payload.settings);
            console.log();
        });
    
        function initiateStatus(context, settings) {
            if (intervals[context]) {
                let interval = intervals[context];
                clearInterval(interval);
            }

            // Initial call for the first time
            setTitleStatus(context, settings);

            // Start Canvas
            canvas = document.createElement('canvas');  
            canvas.width = 144;
            canvas.height = 144;
            block = new Block(canvas);
            ctx = canvas.getContext('2d');

            // Set the text font styles
            ctx.font = 'bold 20px Arial';
            ctx.fillStyle = "white";
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

             // Schedule for every 1 hours.
            intervals[context] = setInterval(() => {
                    let clonedSettings = {};
                    // Just making sure we are not hurt by closure.
                    Object.assign(clonedSettings, settings);
                    setTitleStatus(context, clonedSettings);
                },
                moment.duration(1, 'hours').asMilliseconds());
        }

        function setTitleStatus(context, settings) {
            $SD.api.setTitle(context, "Updating");
            getResults(result => resultCallback(result, context));
                
        }

        // == Color Rules ==
        // Partial Outage = Orange
        // Major Outage = Red
        // Degraded Performance = Purple
        // Under Maintenance = Grey
        // Operational = Green

        // Platform
        function degraded() {
            ctx.fillStyle = "#800080";
            ctx.fill();
            ctx.fillText("Degraded", 15, 50);
        }
        function operational() {
            ctx.fillStyle = "#008000";
            ctx.fill();
            ctx.fillText("Operational", 15, 50);
        }
        function undermaintenance() {
            ctx.fillStyle = "#808080";
            ctx.fill();
            ctx.fillText("Maintenance", 15, 50);
        }
        function majoroutage() {
            ctx.fillStyle = "#FF0000";
            ctx.fill();
            ctx.fillText("M.Outage", 15, 50);
        }
        function partialoutage() {
            ctx.fillStyle = "#FFA500";
            ctx.fill();
            ctx.fillText("P.Outage", 15, 50);
        }


        // Persistence
        function degradedP() {
            ctx.fillStyle = "#800080";
            ctx.fill();
            ctx.fillText("Degraded", 15, 75);
        }
        function operationalP() {
            ctx.fillStyle = "#008000";
            ctx.fill();
            ctx.fillText("Operational", 15, 75);
        }
        function undermaintenanceP() {
            ctx.fillStyle = "#808080";
            ctx.fill();
            ctx.fillText("Maintenance", 15, 75);
        }
        function majoroutageP() {
            ctx.fillStyle = "#FF0000";
            ctx.fill();
            ctx.fillText("M. Outage", 15, 75);
        }
        function partialoutageP() {
            ctx.fillStyle = "#FFA500";
            ctx.fill();
            ctx.fillText("P. Outage", 15, 75);
        }

     
        // Electronic Access
        function degradedE() {
            ctx.fillStyle = "#800080";
            ctx.fill();
            ctx.fillText("Degraded", 15, 100);
        }
        function operationalE() {
            ctx.fillStyle = "#008000";
            ctx.fill();
            ctx.fillText("Operational", 15, 100);
        }
        function undermaintenanceE() {
            ctx.fillStyle = "#808080";
            ctx.fill();
            ctx.fillText("Maintenance", 15, 100);
        }
        function majoroutageE() {
            ctx.fillStyle = "#FF0000";
            ctx.fill();
            ctx.fillText("M. Outage", 15, 100);
        }
        function partialoutageE() {
            ctx.fillStyle = "#FFA500";
            ctx.fill();
            ctx.fillText("P. Outage", 15, 100);
        }

        function resultCallback(result, context) {
            // Testing with String to see if everything outputted ok
            if (!result.hasOwnProperty("Object")) {
                // Clean up String
                const json = JSON.stringify(result, null, 1);
                const removeBracket = json.replace(/{/g, '').replace(/}/g, '');
                const unquoted = removeBracket.replace(/\"/g, "");  
                // $SD.api.setTitle(context, unquoted)
                
                // load bg-image
                ctx = canvas.getContext("2d");
                img = document.getElementById("bg");
                ctx.drawImage(img, 0, 0);
                
                // Add to String and Split Lines

                splitlines = ("PF" + ' ' + result.PF.replace(new RegExp(' ', 'g'), '\n') + '\n' + "PU" + ' ' + result.PU + '\n' + "EA" + ' ' + result.EA + '\n' )
            
                // Split Lines
                var lines = splitlines.split('\n');
 
                var arr = [lines.shift(),lines.shift(), lines.shift(), lines.join(' ')];
                const platform = arr[0];
                const persistence = arr[1];
                const electronic = arr[2];
                console.log(electronic);

                // If platform contains a text swap out THAT specific text
                if (platform.includes('operational') == true) {
                    operational();
                } else if (platform.includes('degraded-performance') == true) {
                    degraded();
                } else if (platform.includes('under-maintenance') == true) {
                    undermaintenance();
                } else if (platform.includes('major-outage') == true) {
                    majoroutage();
                } else if (platform.includes('partial-outage') == true) {
                    partialoutage();
                }

                // If persistence contains a text swap out THAT specific text
                if (persistence.includes('operational') == true) {
                    operationalP();
                } else if (persistence.includes('degraded-performance') == true) {
                    degradedP();
                } else if (persistence.includes('under-maintenance') == true) {
                    undermaintenanceP();
                } else if (persistence.includes('major-outage') == true) {
                    majoroutageP();
                } else if (persistence.includes('partial-outage') == true) {
                    partialoutageP();
                }

                // If electronic contains a text swap out THAT specific text
                if (electronic.includes('operational') == true) {
                    operationalE();
                } else if (electronic.includes('degraded-performance') == true) {
                    degradedE();
                } else if (electronic.includes('under-maintenance') == true) {
                    undermaintenanceE();
                } else if (electronic.includes('major-outage') == true) {
                    majoroutageE();
                } else if (electronic.includes('partial-outage') == true) {
                    partialoutageE();
                }

                // Null the Title so Nothing Shows
                $SD.api.setTitle(context, '', null);
                $SD.api.setImage(
                    context,
                    block.getImageData()
                );
                return;
            }
        }
        function getResults(updateTitleFn) {
            let endPoint = "https://status.robertsspaceindustries.com/static/content/api/v0/systems.en.json";
            $.getJSON(endPoint)
                .done(function (response) {
                    // updateTitleFn(response[0].status)
                    updateTitleFn({
                        "PF": response[0].status,
                        "PU": response[1].status,
                        "EA": response[2].status,
                    });                   
                })
                .fail(function (jqxhr, textStatus, error) {
                    if (jqxhr.status === 503) {
                        updateTitleFn("Exceeded...!")
                    } else {
                        updateTitleFn(error);
                    }
                });
        }
    }