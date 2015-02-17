var fs = require('fs');
var _ = require('lodash');
var csvjson = require('csvjson');
var Promise = require('es6-promise').Promise;
var conf = require('./package.json').conf;

var Overpass = require('./overpass');

module.exports = function(grunt){

  grunt.loadNpmTasks('grunt-exec');

  grunt.initConfig({
    exec: {
      validate: {
        command: 'python ./utils/transitfeed/feedvalidator.py gtfs/'
      }
    }
  });

  grunt.registerTask('cache', function(){

    var done = this.async();

    // FIXME use config!
    var overpass = new Overpass([3652883, 3775826, 3776282]);

    var types = ['masters', 'stops', 'routes', 'ways', 'nodes'];
    /*
     * array of arrays with [routes, ways, nodes]
     */
    function saveData(data){
      _.each(data, function(arr, index){
        fs.writeFileSync('./cache/' + types[index] + '.json', JSON.stringify(arr));
      });
      console.log('data saved to ./cache');
    }

    /*
     * get all data and save to disk
     */
    Promise.all(types.map(overpass.fetch, overpass))
      .then(saveData)
      .catch(function(err){
        console.log(err);
      }).then(done);

  });

  function loadData(list){
    return list.map(function(type){
      return JSON.parse(fs.readFileSync('./cache/' + type + '.json').toString());
    });
  }

  function loadGtfs(list){
    return list.map(function(type){
      return csvjson.toObject('./gtfs/' + type + '.txt').output;
    });
  }

  /**
   * create a timetable from Miccolis file
   *
   * if lines not specified, upload all available lines
   * otherwise only lines in the set
   *
   */
  function loadTimetables(lines){
    var rootDir = './miccolis/timetables/',
        table = {};
    fs.readdirSync( rootDir )
      .forEach(function(filename){
        var matches = /MT(.*)\.csv/.exec(filename);
        if ( !matches ){
          console.error('Malformed filename: ' + filename + '. Correct syntax: ".*MT.*\.csv".');
          return; // skip
        }
        var name = matches[1];
        if ( !lines || _.contains(lines, name) ){
          table[ name ] = _.reject(
                    csvjson.toObject(rootDir + filename).output,
                    function(obj){ return obj.id === ''; } // remove rows with no stop
                );
        }
     });
    return table;
  }

  function loadCalendar(){
    return csvjson.toObject( './miccolis/calendar/by_line.txt' ).output;
  }

  function toCSV(records){
    return records.map(function(row){
      return row.join(',');
    }).join("\n");
  }

  grunt.registerTask('shapes', function(){

    var shapesBuilder = require('./builders/shapes');
    var csvHeader = "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n";
    var shapes = shapesBuilder(loadData(['routes', 'ways', 'nodes']));
    fs.writeFileSync('./gtfs/shapes.txt', csvHeader + toCSV(shapes));

  });

  grunt.registerTask('stops', function(){

    var stopsBuilder = require('./builders/stops');
    var csvHeader = "stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon\n";
    var stops = stopsBuilder(loadData(['stops']));
    fs.writeFileSync('./gtfs/stops.txt', csvHeader + toCSV(stops));

  });

  grunt.registerTask('stop_times', function(){

    var stoptimesBuilder = require('./builders/stop_times');
    var csvHeader = "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n";
    var stoptimes = stoptimesBuilder( loadData([ 'masters', 'routes', 'stops']), loadGtfs(['calendar']), loadTimetables() );
    fs.writeFileSync('./gtfs/stop_times.txt', csvHeader + toCSV(stoptimes));

  });

  grunt.registerTask('routes', function(){

    var routesBuilder = require('./builders/routes');
    var csvHeader = "route_id,agency_id,route_short_name,route_long_name,route_type\n";
    var routes = routesBuilder( loadData(['masters']) );
    fs.writeFileSync('./gtfs/routes.txt', csvHeader + toCSV(routes));

  });

  grunt.registerTask('frequencies', function(){

    var frequenciesBuilder = require('./builders/frequencies');
    var csvHeader = "trip_id,start_time,end_time,headway_secs,exact_times\n";
    var frequencies = frequenciesBuilder( loadData(['masters', 'routes']), loadTimetables(), loadCalendar());
    fs.writeFileSync('./gtfs/frequencies.txt', csvHeader + toCSV(frequencies));

  });

  grunt.registerTask('trips', function(){

    var tripsBuilder = require('./builders/trips');
    var csvHeader = "route_id,service_id,trip_id,trip_headsign,shape_id\n";
    var trips = tripsBuilder( loadData(['masters', 'routes']), loadGtfs(['calendar']) );
    fs.writeFileSync('./gtfs/trips.txt', csvHeader + toCSV(trips));

  });

  grunt.registerTask('calendar', function(){

    var calendarBuilder = require('./builders/calendar');
    var csvHeader = "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n";
    var calendar = calendarBuilder( conf );
    fs.writeFileSync('./gtfs/calendar.txt', csvHeader + toCSV(calendar));

  });

  grunt.registerTask('calendar_dates', function(){

    var calendarDatesBuilder = require('./builders/calendar_dates');
    var csvHeader = "service_id,date,exception_type\n";
    var calendarDates = calendarDatesBuilder( conf );
    fs.writeFileSync('./gtfs/calendar_dates.txt', csvHeader + toCSV(calendarDates));

  });

  // NB: the order of task in important
  grunt.registerTask('compile', ['cache', 'shapes', 'stops', 'calendar', 'calendar_dates', 'stop_times', 'routes', 'frequencies', 'trips'])

  grunt.registerTask('validate', ['grunt:validate']);

};
