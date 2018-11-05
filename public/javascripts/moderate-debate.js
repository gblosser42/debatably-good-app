var $ = window.$;
var TweenMax = window.TweenMax;
var Elastic = window.Elastic;
var youWon = window.youWon;

var errorHandler = function () {
	$('#page').hide().after(
		'<h1>Your connection to the debate server has been lost. '+
		'Please refresh the page.</h1>'
	);
};

var onVote;
var sessionCode;

var doChartStuff = function () {
	var aBar = document.querySelector('#aBar');
	var bBar = document.querySelector('#bBar');
	var connected = document.querySelector('#connected');
	//Hide connected text
	connected.setAttribute('scale','0 0 0');
	
	var total = 0.001; //protect from div/0
	var aVote = 0.0;
	var bVote = 0.0;
	var cVote = 0.0;
	
	var scalar = 1;
	var easing = 0.85;
	
	var reset = () => {
	  total = 0.001; //protect from div/0
	  aVote = 0.0;
	  bVote = 0.0;
	};
	
	onVote = (voteA, voteB, voteC) => {
	  aVote = parseFloat(voteA);
	  bVote = parseFloat(voteB);
	  cVote = parseFloat(voteC);
	  total = aVote + bVote + cVote;
	//   renderLoop();
	  console.log(aVote, bVote, cVote, total)
	};
	
	var scaleBars = (bar, votes) => {
		var curScale = bar.getAttribute('scale');
		var curPos = bar.getAttribute('position');
		var mag = Math.sqrt(votes*votes + total*total);
		var targetY = (Math.sqrt(votes*votes) / mag  * scalar) * easing;
		curScale.y = (curScale.y + targetY)* easing;
		curPos.y = curScale.y * .5;
		bar.setAttribute('scale', curScale);
		bar.setAttribute('position', curPos);
	};
	
	var renderLoop = () => {
		scaleBars(aBar, aVote);
		scaleBars(bBar, bVote);
		requestAnimationFrame(renderLoop);
	};
	
	// Start 
	document.querySelector('#main').addEventListener('loaded', renderLoop);
	
};


$(function() {

	sessionCode = $('#audienceCode').text();

	$('#chart').html(
		'<a-scene embedded id="main" background="color: #000000">'+
			'<a-box id="aBar" position="-1 0.125 -3" rotation="0 0 0" scale="1 .25 1" color="#4CC3D9"></a-box>'+
			'<a-box id="bBar" position="1 0.125 -3" rotation="0 0 0" scale="1 .25 1" color="#FFC65D"></a-box>'+
			'<a-plane position="0 0 -4" rotation="-90 0 0" width="10" height="4" color="#515151" shadow></a-plane>'+
			'<a-text id="connected" value="Connected" color="#BBB" position="3 0.25 -2" scale=".5 .5 .5"></a-text>'+
			'<a-text id="player1" value="'+$('#opinionA').text()+'" color="#BBB" position="-1 0.25 -2" scale="1 1 1"></a-text>'+
			'<a-text id="player2" value="'+$('#opinionB').text()+'" color="#BBB" position=".65 0.25 -2" scale="1 1 1"></a-text>'+
		'</a-scene>'
	);

	doChartStuff();

	// prep the stats so they don't barf onload
	onVote(
		1,
		1,
		1
	);

	// Create WebSocket connection.
	var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	var socket = new WebSocket(protocol+'//'+location.host+'/moderate-debate/?sessionCode='+sessionCode);

	window['debugSocket'] = socket;

	$('#joinLocation').text(' '+location.host+' ');

	var handleSocketClosed = (evt) => {
		console.log('Session closed', evt);
		errorHandler();
	};

	var handleSocketError = (errEvt) => {
		console.log('error', errEvt);
		errorHandler();
	};

	var totals = { 'A':0, 'B':0 };

	var animateWinnerIn = function () {

		var winner = (totals['A'] > totals['B']) ? $('#opinionA').text(): $('#opinionB').text();

		$(document.body).css({'position':'relative'});

		$('#page').hide();
		$('.wrapper').css({position:'absolute',top:0,left:0,right:0,bottom:0}).html(
			'<div style="width:40%;margin-top:20%;text-align:center;margin-left:30%;margin-right:30%;">'+
				'<h1 id="winner">' + winner + ' wins!</h1>'+
			'</div>'
		);

		var tween = TweenMax.fromTo(
			document.querySelector('#winner'), // target
			2, // seconds
			// from vars
			{
				'font-size': '0.1em',
				opacity: '0'
			},
			// to vars
			{
				'font-size': '6em',
				opacity: '1',
				ease: Elastic.easeOut,
				onComplete: youWon
			}
		);

	};

	// Listen for messages
	socket.addEventListener('message', (msgEvt) => {

		if (msgEvt.data) {

			var event = JSON.parse(msgEvt.data);

			switch (event.type) {
				case 'moderator-update':

					var audience = event.data.audience;
					$('#audience').html('<li>' + audience.join('</li><li>') + '</li>');

					// expected format is {started:bool, completed:bool, timeRemaining:ms}
					var debateDetails = event.data.debateDetails;
					if (debateDetails.completed) {
						var button = $('#startDebate:visible');
						if (button) { button.hide(); }
					} else if (!debateDetails.started) {
						var button = $('#startDebate:hidden');
						if (button) {
							button.show();
						}
					} else {
						var button = $('#startDebate:visible');
						if (button) { button.hide(); }

						var chartData = event.data.chartData;
						// expected line data format:
						// var lineData = { time: time, participantA: 1-10, participantB: 1-10, undecided: 1-10 };
						totals['A'] = chartData.participantA.total;
						totals['B'] = chartData.participantB.total;
						onVote(
							chartData.participantA.total,
							chartData.participantB.total,
							chartData.undecided.total
						);

						var secondsRemaining = Math.round(debateDetails.timeRemaining/1000);
						if (secondsRemaining < 1) {
							$('#timeRemaining').text('Done! Fin!');
	
							var request = {
								type:'close-debate'
							};
							socket.removeEventListener('close', handleSocketClosed);
							socket.removeEventListener('error', handleSocketError);
							socket.send(JSON.stringify(request));
							socket.close();
							animateWinnerIn();
						} else {
							$('#timeRemaining')
								.removeClass('hidden')
								.text(secondsRemaining + ' seconds remaining.');
						}
					}

					break;
				default:
					console.log('Unknown event received', msgEvt);
					break;
			}
		}
	});

	socket.addEventListener('close', handleSocketClosed);
	socket.addEventListener('error', handleSocketError);

	$('#startDebate').on('click', () => {
		socket.send('{"type":"start-session"}');
		$('#startDebate').unbind().hide();
	});

});



