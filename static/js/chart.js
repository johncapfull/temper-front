//////////////////////////////////////////////////////////

$.xhrPool = [];
$.xhrPool.abortAll = function() {
    $(this).each(function(idx, jqXHR) {
        jqXHR.abort();
    });
    $.xhrPool.length = 0
};

$.ajaxSetup({
    beforeSend: function(jqXHR) {
        $.xhrPool.push(jqXHR);
    },
    complete: function(jqXHR) {
        var index = $.xhrPool.indexOf(jqXHR);
        if (index > -1) {
            $.xhrPool.splice(index, 1);
        }
    }
});

//////////////////////////////////////////////////////////

var chart; // global chart variable
var activeReq = 0;

function makeSeries(newId) {
    var series = {
        id: newId,
        name: 'main room (\u00B10.1\u00B0C)',
        type: 'area',
        data: []
    };

    return chart.addSeries(series);
}

function abortAll() {
    $.xhrPool.abortAll();
    activeReq = 0;
}

// Simple Moving Average
// http://rosettacode.org/wiki/Averages/Simple_moving_average#C.2B.2B
function simple_moving_averager(period) {
    var nums = [];
    return function(num) {
        nums.push(num);
        if (nums.length > period)
            nums.splice(0,1);  // remove the first element of the array
        var sum = 0;
        for (var i in nums)
            sum += nums[i];
        var n = period;
        if (nums.length < period)
            n = nums.length;
        return(sum/n);
    }
}

// Get data from server in JSON format (query time series when sensor was outside).
function getData(start) {
    var request = 'query?count=-1&start_date=' + start.toISOString();

    activeReq++;

    var handle = $.getJSON(request);
    handle.done(function(data) {
        var id = "main";

        var series = chart.get(id);
        if (series == null) {
            series = makeSeries(id);
        }

        // TODO: For test -- apply SMA
        var sma = simple_moving_averager(15); // ~ 15 minutes
        
        // Iterate JSON data series and add to plot
        var chartData = [];
        var i = 0;
        while (data[i]) {
            var value = sma(data[i].celsius);

            // leaving 2 numbers after decimal point
            value = Math.round(value * 100) / 100

            chartData.push([
                data[i].time * 1000,
                value]);
            i++;
        }

        series.setData(chartData);

        if (--activeReq == 0) {
            chart.hideLoading();
        }
    });

    handle.fail(function(data) {
        abortAll();
        chart.hideLoading();
    });    
}

function clearChart() {
    while (chart.series.length > 0) {
        chart.series[0].remove(true);
    }
}

function getDataForDays(days) {
    var start = new Date();
    start.setDate(start.getDate() - days);
    return getData(start); // TODO: test 2 days
}

function initChart(days) {
    Highcharts.setOptions({
        global: {
            useUTC: false
        }
    });

    chart = new Highcharts.Chart({
        chart: {
            renderTo: 'temper_chart',
            zoomType: 'x',
            events: {
                load: getDataForDays.bind(undefined, days)
            }
        },
        
        title: {
            text: '' // empty title to hide
        },

        subtitle: {
            text: 'Click and drag in the plot area to zoom in',
            align: 'right',  
        },

        xAxis: {
            type: 'datetime',
            tickPixelInterval: 150,
            maxZoom: 20 * 100000,
            
            title: {
                text: 'Time',
                margin: 15
            }
        },

        yAxis: {
            minPadding: 0.2,
            maxPadding: 0.2,
            showFirstLabel: false,
            title: {
                text: 'Temperature \u00B0C',
                margin: 15
            }
        },
 
        plotOptions: {
            area: {                                
                shadow: false,
                lineWidth: 1,
                //fillOpacity: 0,

                fillColor: {
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1},
                    stops: [
                        [0, Highcharts.getOptions().colors[0]],
                        [1, 'rgba(255,255,255,0)'],
                    ]
                },                
                states: {
                    hover: {
                        lineWidth: 1,
                    }
                },
                marker: {
                    enabled: false,
                    states: {
                        hover: {
                            enabled: true,
                            radius: 5
                        }
                    }
                },

                threshold: null
            },          
        },
    })
}

function initDayClicker() {
    var days = [1, 2, 5, 7, 31, 365];

    var id = function(day) {
        return "#days_" + day.toString();
    }

    var clean = function() {
        for (var i = 0; i < days.length; i++) {
            $(id(days[i])).parent().removeClass("active");
        }
    }

    var requestDay = function(day) {
        clean();
        $(id(day)).parent().addClass("active");

        abortAll();
        chart.showLoading();
        getDataForDays(day);
    }

    for (var i = 0; i < days.length; i++) {
        var day = days[i];

        var requestTheDay = requestDay.bind(undefined, day);
        $(id(day)).click(requestTheDay);
    }
}

function initFace() {
    initDayClicker();
    initChart(1);
}
