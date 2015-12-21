'use strict';
window.app = angular.module('GeoQuest', ['fsaPreBuilt', 'ui.router', 'ui.sortable', 'ui.bootstrap', 'ngAnimate', 'leaflet-directive']);

app.config(function ($urlRouterProvider, $locationProvider) {
	// This turns off hashbang urls (/#about) and changes it to something normal (/about)
	$locationProvider.html5Mode(true);
	// If we go to a URL that ui-router doesn't have registered, go to the "/" url.
	$urlRouterProvider.otherwise('/dashboard');
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state) {

	// The given state requires an authenticated user.
	var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
		return state.data && state.data.authenticate;
	};

	// $stateChangeStart is an event fired
	// whenever the process of changing a state begins.
	$rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

		if (!destinationStateRequiresAuth(toState)) {
			// The destination state does not require authentication
			// Short circuit with return.
			return;
		}

		if (AuthService.isAuthenticated()) {
			// The user is authenticated.
			// Short circuit with return.
			return;
		}

		// Cancel navigating to new state.
		event.preventDefault();

		AuthService.getLoggedInUser().then(function (user) {
			// If a user is retrieved, then renavigate to the destination
			// (the second time, AuthService.isAuthenticated() will work)
			// otherwise, if no user is logged in, go to "login" state.
			if (user) {
				$state.go(toState.name, toParams);
			} else {
				$state.go('login');
			}
		});
	});
});

(function () {

	'use strict';

	// Hope you didn't forget Angular! Duh-doy.
	if (!window.angular) throw new Error('I can\'t find Angular!');

	var app = angular.module('fsaPreBuilt', []);

	app.factory('Socket', function () {
		if (!window.io) throw new Error('socket.io not found!');
		return window.io(window.location.origin);
	});

	// AUTH_EVENTS is used throughout our app to
	// broadcast and listen from and to the $rootScope
	// for important events about authentication flow.
	app.constant('AUTH_EVENTS', {
		loginSuccess: 'auth-login-success',
		loginFailed: 'auth-login-failed',
		logoutSuccess: 'auth-logout-success',
		sessionTimeout: 'auth-session-timeout',
		notAuthenticated: 'auth-not-authenticated',
		notAuthorized: 'auth-not-authorized'
	});

	app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
		var statusDict = {
			401: AUTH_EVENTS.notAuthenticated,
			403: AUTH_EVENTS.notAuthorized,
			419: AUTH_EVENTS.sessionTimeout,
			440: AUTH_EVENTS.sessionTimeout
		};
		return {
			responseError: function responseError(response) {
				$rootScope.$broadcast(statusDict[response.status], response);
				return $q.reject(response);
			}
		};
	});

	app.config(function ($httpProvider) {
		$httpProvider.interceptors.push(['$injector', function ($injector) {
			return $injector.get('AuthInterceptor');
		}]);
	});
	app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q) {

		function onSuccessfulLogin(response) {
			var data = response.data;
			Session.create(data.id, data.user);
			$rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
			return data.user;
		}

		// Uses the session factory to see if an
		// authenticated user is currently registered.
		this.isAuthenticated = function () {
			return !!Session.user;
		};

		this.getLoggedInUser = function (fromServer) {

			// If an authenticated session exists, we
			// return the user attached to that session
			// with a promise. This ensures that we can
			// always interface with this method asynchronously.

			// Optionally, if true is given as the fromServer parameter,
			// then this cached value will not be used.

			if (this.isAuthenticated() && fromServer !== true) {
				return $q.when(Session.user);
			}

			// Make request GET /session.
			// If it returns a user, call onSuccessfulLogin with the response.
			// If it returns a 401 response, we catch it and instead resolve to null.
			return $http.get('/session').then(onSuccessfulLogin)['catch'](function () {
				return null;
			});
		};

		this.login = function (credentials) {
			return $http.post('/login', credentials).then(onSuccessfulLogin)['catch'](function () {
				return $q.reject({ message: 'Invalid login credentials.' });
			});
		};

		this.signup = function (credentials) {
			//sends a post request containing the user's credentials to
			return $http.post('api/users/signup', credentials)
			//once the user has been created on the backend...
			.then(function (response) {
				//a second post request is created to log the user in
				return $http.post('/login', credentials);
			}).then(onSuccessfulLogin)['catch'](function () {
				return $q.reject({ message: 'Invalid signup credentials.' });
			});
		};

		this.logout = function () {
			return $http.get('/logout').then(function () {
				Session.destroy();
				$rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
			});
		};
	});

	app.service('Session', function ($rootScope, AUTH_EVENTS) {

		var self = this;

		$rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
			self.destroy();
		});

		$rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
			self.destroy();
		});

		this.id = null;
		this.user = null;

		this.create = function (sessionId, user) {
			this.id = sessionId;
			this.user = user;
		};

		this.destroy = function () {
			this.id = null;
			this.user = null;
		};
	});
})();

app.config(function ($stateProvider) {

	$stateProvider.state('home', {
		url: '/',
		templateUrl: 'js/home/home.html',
		controller: 'HomeCtrl',
		resolve: {
			requestedUser: function requestedUser(AuthService) {
				return AuthService.getLoggedInUser();
			}
		}
	});
});

app.controller('HomeCtrl', function ($scope, AuthService, $state, requestedUser) {
	// If there's a logged in user upon load, go to the dashboard
	if (requestedUser) $state.go('dashboard', { userId: requestedUser._id });

	$scope.home = true; // To know what nav links to show
	$scope.login = {};
	$scope.signup = {};
	$scope.loginError = null;
	$scope.signupError = null;

	$scope.sendLogin = function (loginInfo) {
		$scope.error = null;

		AuthService.login(loginInfo).then(function (user) {
			$state.go('dashboard', { userId: user._id });
		})['catch'](function () {
			$scope.loginError = "I think you\'ve entered the wrong info, friend";
		});
	};

	$scope.sendSignup = function (signupInfo) {
		$scope.error = null;
		AuthService.signup(signupInfo).then(function (user) {
			$state.go('dashboard', { userId: user._id }, { reload: true });
		})['catch'](function () {
			$scope.signupError = "I'm afraid we already have someone by that name";
		});
	};

	// Paralax effect for images
	$(function () {
		// Cache the window object (makes load time faster)
		var $window = $(window);
		// Parallax background effect
		$('section[data-type="background"]').each(function () {
			var $bgobj = $(this); // assigning the object
			$(window).scroll(function () {
				//scroll the background at var speed
				// the yPos is a negative because we're scrolling it up
				var yPos = -($window.scrollTop() / $bgobj.data('speed'));
				// Put together our final background position
				var coords = '50% ' + yPos + 'px';
				// Move the background
				$bgobj.css({ backgroundPosition: coords });
			}); // end window scroll
		});
	});
});
app.config(function ($stateProvider) {
	$stateProvider.state('editor', {
		url: '/editor/:id',
		templateUrl: 'js/quest-editor/editor.html',
		controller: 'EditorCtrl',
		resolve: {
			quest: function quest(QuestFactory, $stateParams) {
				return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory, AuthService) {
	//variable saved to show/hide quest editor when editing individual states
	$rootScope.editorVisible = true;
	$scope.quest = quest;
	$scope.viewMainMap = true;
	$scope.newQuest = false;
	//if there is no new quest, set properties
	if (!quest) {
		$scope.newQuest = true;
		$scope.quest = {
			start: [40.723008, -74.0006327]
		};
	}

	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {
		if (!$scope.newQuest) {
			return QuestFactory.save($scope.quest).then(function () {
				$state.go('dashboard', { userId: Session.user._id });
			});
		} else {
			return QuestFactory.saveNew($scope.quest).then(function () {
				$state.go('dashboard', { userId: Session.user._id });
			});
		}
	};
	//go to mapStates editor and hide Quest editor
	$scope.transitionToMapStateEditor = function () {
		if (!$scope.newQuest) {
			return QuestFactory.save($scope.quest).then(function () {
				if ($scope.quest.questSteps.length === 0) {
					$state.go('editor.questStep', { questStepId: null });
				} else {
					$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[0]._id });
				}
				$scope.editorVisible = false;
			});
		} else {
			return QuestFactory.saveNew($scope.quest).then(function (savedQuest) {
				$scope.editorVisible = false;
				$state.go('editor.questStep', { id: savedQuest._id, questStepId: null });
			});
		}
	};

	$scope.logout = function () {
		AuthService.logout().then(function () {
			$state.go('home');
		});
	};

	//***********  MAP FUNCTIONS BELOW  ***********************
	var userLocation;
	var targetCircles = [];
	var circleCenters = [];
	var questMap = L.map('quest-map').setView([40.723008, -74.0006327], 13);
	questMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questMap);

	// If there are no targetCircles yet created, set map view to user's location
	if (!$scope.quest.questSteps[0] || !$scope.quest.questSteps[0].targetCircle) {

		questMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questMap.setView(userLocation, 14);
		});
	}

	// Redraw all targetCircles for the quest on the map and reset the bounds
	function drawCircles() {
		// Remove all circles
		targetCircles.forEach(function (circle) {
			questMap.removeLayer(circle);
		});
		// Draw a circle for every targetCircle in the quest
		if ($scope.quest.questSteps.length) {
			$scope.quest.questSteps.forEach(function (step, index) {
				if (step.targetCircle && step.targetCircle.center.length) {
					var center = step.targetCircle.center;
					var radius = step.targetCircle.radius;
					var circle = L.circle(center, radius);
					circle.bindLabel((index + 1).toString(), { noHide: true }).addTo(questMap);
					targetCircles.push(circle);
					circleCenters.push(step.targetCircle.center);
				}
			});
			questMap.fitBounds(circleCenters);
		}
	}
	drawCircles();
});

app.config(function ($stateProvider) {
	$stateProvider.state('dashboard', {
		url: '/dashboard/:userId',
		templateUrl: 'js/user-dashboard/dashboard.html',
		controller: 'DashCtrl',
		resolve: {
			userQuests: function userQuests(QuestFactory, $stateParams) {
				return QuestFactory.getUserQuests($stateParams.userId);
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('DashCtrl', function ($state, $scope, userQuests, Session, QuestFactory) {
	$scope.dashboard = true;
	$scope.quests = [];
	$scope.quests = userQuests.map(function (g) {
		g.showDetail = false;
		return g;
	});

	$scope.goToEditor = function (questClicked) {
		$state.go('editor', { id: questClicked._id }, { reload: true });
	};
	$scope.deleteQuest = function (questClicked) {
		return QuestFactory['delete'](questClicked).then(function (deletedQuest) {
			$state.go('dashboard', { userId: Session.user._id }, { reload: true });
		});
	};
	$scope.parentClick = function (index) {
		var quest = $scope.quests[index];
		quest.showDetail = !quest.showDetail;
	};
	$scope.switchActive = function (questClicked) {
		QuestFactory.save(questClicked);
	};
});

app.config(function ($stateProvider) {
	$stateProvider.state('editor.questStep', {
		url: '/queststep/:questStepId',
		templateUrl: 'js/quest-step-editor/quest-step-editor.html',
		controller: 'QuestStepEditCtrl',
		resolve: {
			quest: function quest(QuestFactory, $stateParams) {
				return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('QuestStepEditCtrl', function ($stateParams, $scope, $state, $rootScope, quest, QuestFactory) {
	$scope.quest = quest;
	$rootScope.editorVisible = false;
	$scope.viewMap = true;
	var userLocation;

	//defind new Step for adding to steps array
	$scope.newStep = {
		name: 'New Step',
		targetCircle: {
			center: [],
			radius: null
		}
	};
	//if we have steps, find the index of the step that matches the params
	if ($scope.quest.questSteps.length > 0) {
		$scope.quest.questSteps.forEach(function (step, index) {
			if (step._id === $stateParams.questStepId) {
				$scope.quest.idx = index;
			}
		});
		//sets currentStep to that matching the parameters
		$scope.currentStep = $scope.quest.questSteps[$scope.quest.idx];
	} else {
		$scope.quest.questSteps.push($scope.newStep);
		$scope.currentStep = $scope.quest.questSteps[0];
	}
	//function to switch states within mapState editor
	$scope.switchStep = function (clickedStep) {
		QuestFactory.save($scope.quest).then(function () {
			// redirect to the clicked mapstate
			$state.go('editor.questStep', { questStepId: clickedStep._id });
		});
	};
	$scope.saveQuestSteps = function () {
		//updates current mapState
		QuestFactory.save($scope.quest).then(function (updatedQuest) {
			$scope.quest = updatedQuest;
			$state.go('editor', { id: $scope.quest._id }, { reload: true });
		});
	};
	$scope.returnWithoutSaving = function () {
		$state.go('editor', { id: $scope.quest._id }, { reload: true });
	};
	$scope.addQuestStep = function () {
		$scope.quest.questSteps.push($scope.newStep);
		return QuestFactory.save($scope.quest).then(function (updatedQuest) {
			$scope.quest = updatedQuest;
			$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[$scope.quest.questSteps.length - 1]._id });
		});
	};
	$scope.removeQuestStep = function () {
		var index = $scope.quest.questSteps.indexOf($scope.currentStep);
		$scope.quest.questSteps.splice(index, 1);
		if (index === $scope.quest.questSteps.length) index--;
		return QuestFactory.save($scope.quest).then(function (updatedQuest) {
			$scope.quest = updatedQuest;
			var stepDestination = $scope.quest.questSteps.length === 0 ? null : $scope.quest.questSteps[index]._id;
			$state.go('editor.questStep', { questStepId: stepDestination }, { reload: true });
		});
	};

	// initialize map
	var questStepMap = L.map('quest-step-map');
	questStepMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	//add pirate map tiles
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questStepMap);

	// Set view using targetCircle for this step if defined
	// Then try first targetCircle for quest if defined
	// Otherwise get user's location and set map view with that
	if ($scope.currentStep.targetCircle.center.length === 2) {
		questStepMap.setView($scope.currentStep.targetCircle.center, 15);
	} else if ($scope.quest.questSteps[0].targetCircle.center.length === 2) {
		questStepMap.setView($scope.quest.questSteps[0].targetCircle.center, 15);
	} else {
		questStepMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questStepMap.setView(userLocation, 15);
		});
	}

	// Initialize the FeatureGroup to store editable layers
	var drawnItems = new L.FeatureGroup();
	questStepMap.addLayer(drawnItems);

	// Initialize the draw control and pass it the FeatureGroup of editable layers
	var drawControl = new L.Control.Draw({
		draw: {
			polyline: false,
			polygon: false,
			rectangle: false,
			marker: false
		},
		edit: {
			featureGroup: drawnItems
		}
	});
	questStepMap.addControl(drawControl);
	//if there is a target region, draw it on the map
	if ($scope.currentStep.targetCircle.center.length === 2) {
		var currentRegion = L.circle($scope.currentStep.targetCircle.center, $scope.currentStep.targetCircle.radius);
		questStepMap.addLayer(currentRegion);
	}
	var circle;
	questStepMap.on('draw:created', function (e) {
		//remove the loaded region then remove any newly drawn circles
		if (currentRegion) questStepMap.removeLayer(currentRegion);
		if (circle) questStepMap.removeLayer(circle);
		var type = e.layerType;
		var layer = e.layer;
		//assign target region to properties of drawn object
		$scope.currentStep.targetCircle.center = [layer._latlng.lat, layer._latlng.lng];
		$scope.currentStep.targetCircle.radius = layer._mRadius;
		//declare new object based on propertied drawn and add to map
		circle = L.circle([layer._latlng.lat, layer._latlng.lng], layer._mRadius);
		questStepMap.addLayer(circle);
	});

	$scope.getModalButtonText = function () {
		if ($scope.currentStep && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.question) return "Submit!";
		return "Got it!";
	};
});

app.factory('QuestFactory', function ($http, Session) {

	return {

		getAllQuests: function getAllQuests() {
			return $http.get('/api/quests').then(function (res) {
				return res.data;
			});
		},
		getOneQuest: function getOneQuest(questId) {
			return $http.get('/api/quests/' + questId).then(function (res) {
				return res.data;
			});
		},
		getUserQuests: function getUserQuests(userId) {
			return $http.get('/api/quests/userquests/' + userId).then(function (res) {
				return res.data;
			});
		},
		save: function save(quest) {
			return $http.put('/api/quests/' + quest._id, quest).then(function (res) {
				return res.data;
			});
		},
		saveNew: function saveNew(quest) {
			quest.author = Session.user._id;
			return $http.post('/api/quests/', quest).then(function (res) {
				return res.data;
			});
		},
		'delete': function _delete(quest) {
			return $http['delete']('/api/quests/' + quest._id);
		}
	};
});

app.directive('blueHeader', function (AuthService, $state) {

	return {
		restrict: 'E',
		scope: {
			head: '@',
			small: '@'
		},
		templateUrl: 'js/common/directives/blue-header/blue-header.html',
		link: function link(scope) {

			scope.user = null;

			var setUser = function setUser() {
				AuthService.getLoggedInUser().then(function (user) {
					scope.user = user;
				});
			};

			setUser();

			scope.logout = function () {
				AuthService.logout().then(function () {
					$state.go('home');
				});
			};
		}
	};
});
app.directive('fullstackLogo', function () {
	return {
		restrict: 'E',
		templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
	};
});
app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

	return {
		restrict: 'E',
		scope: {
			home: '=',
			dashboard: '='
		},
		templateUrl: 'js/common/directives/navbar/navbar.html',
		link: function link(scope) {

			scope.items = [{ label: 'Dashboard', state: 'home', auth: true }, { label: 'New Quest', state: 'editor', auth: true }];

			scope.user = null;

			scope.isLoggedIn = function () {
				return AuthService.isAuthenticated();
			};

			var setUser = function setUser() {
				AuthService.getLoggedInUser().then(function (user) {
					scope.user = user;
				});
			};

			var removeUser = function removeUser() {
				scope.user = null;
			};

			setUser();

			$rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
			$rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
			$rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

			// Pretty Scrolling Navbar Effect
			$(window).scroll(function () {
				if ($('.navbar').offset().top > 50 && scope.home) {
					$('.navbar-fixed-top').addClass('top-nav-collapse');
					console.log('doooowwwwwn');
				} else if (scope.home) {
					$('.navbar-fixed-top').removeClass('top-nav-collapse');
					console.log('uuuuuuup');
				}
			});

			// Animated Scroll To Section
			$(function () {
				$('.page-scroll a').bind('click', function () {
					var $anchor = $(this);
					$('html, body').stop().animate({
						scrollTop: $($anchor.attr('href')).offset().top
					}, 1500, 'easeInOutExpo');
					event.preventDefault();
				});
			});
		}

	};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiaG9tZS9ob21lLmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInVzZXItZGFzaGJvYXJkL2Rhc2hib2FyZC5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGVBQUEsQ0FBQSxLQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEsbUJBQUE7QUFDQSxZQUFBLEVBQUEsVUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLEtBQUEsYUFBQSxFQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxLQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFVBQUEsR0FBQSxnREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxXQUFBLEdBQUEsaURBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7OztBQUdBLEVBQUEsQ0FBQSxZQUFBOztBQUVBLE1BQUEsT0FBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsaUNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsT0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBOzs7QUFHQSxRQUFBLElBQUEsR0FBQSxFQUFBLE9BQUEsQ0FBQSxTQUFBLEVBQUEsR0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxNQUFBLEdBQUEsTUFBQSxHQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsVUFBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLGtCQUFBLEVBQUEsTUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtDQUlBLENBQUEsQ0FBQTtBQ2xFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxLQUFBLEVBQUEsYUFBQTtBQUNBLGFBQUEsRUFBQSw2QkFBQTtBQUNBLFlBQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsWUFBQSxFQUFBLFNBQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxXQUFBLENBQUEsYUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxLQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsUUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxLQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLFFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUNBOzs7QUFHQSxPQUFBLENBQUEsU0FBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsMEJBQUEsR0FBQSxZQUFBO0FBQ0EsTUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsUUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7S0FDQSxNQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7S0FDQTtBQUNBLFVBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsTUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsVUFBQSxDQUFBLEdBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsS0FBQSxZQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLFFBQUEsR0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLFNBQUEsRUFBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtBQUNBLEVBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsSUFBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLDhGQUFBO0VBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTs7O0FBR0EsS0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxFQUFBOztBQUVBLFVBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsZUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsT0FBQSxDQUFBLFlBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBOzs7QUFHQSxVQUFBLFdBQUEsR0FBQTs7QUFFQSxlQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTs7QUFFQSxNQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLElBQUEsQ0FBQSxZQUFBLElBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLFNBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0E7QUFDQSxZQUFBLEVBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUN0SEEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxLQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLGtDQUFBO0FBQ0EsWUFBQSxFQUFBLFVBQUE7QUFDQSxTQUFBLEVBQUE7QUFDQSxhQUFBLEVBQUEsb0JBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLGFBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7SUFDQTtHQUNBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFVBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsU0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsR0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsWUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsWUFBQSxVQUFBLENBQUEsWUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxNQUFBLEtBQUEsR0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFlBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3hDQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxrQkFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLHlCQUFBO0FBQ0EsYUFBQSxFQUFBLDZDQUFBO0FBQ0EsWUFBQSxFQUFBLG1CQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBR0EsR0FBQSxDQUFBLFVBQUEsQ0FBQSxtQkFBQSxFQUFBLFVBQUEsWUFBQSxFQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxLQUFBLFlBQUEsQ0FBQTs7O0FBR0EsT0FBQSxDQUFBLE9BQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxVQUFBO0FBQ0EsY0FBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsSUFBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxLQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxPQUFBLENBQUEsVUFBQSxJQUFBLEVBQUEsS0FBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLENBQUEsR0FBQSxLQUFBLFlBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsR0FBQSxLQUFBLENBQUE7SUFDQTtHQUNBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7RUFDQSxNQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQTtBQUNBLFFBQUEsQ0FBQSxXQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUE7RUFDQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7O0FBRUEsU0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTs7QUFFQSxjQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsbUJBQUEsR0FBQSxZQUFBO0FBQ0EsUUFBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxTQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxlQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLEtBQUEsRUFBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsZUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEdBQUEsSUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxlQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsS0FBQSxZQUFBLEdBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsZUFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBOztBQUVBLEVBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsSUFBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLDhGQUFBO0VBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTs7Ozs7QUFLQSxLQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7RUFDQSxNQUFBLElBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQTtBQUNBLGNBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsZUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxlQUFBLENBQUEsT0FBQSxDQUFBLFlBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBOzs7QUFHQSxLQUFBLFVBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxRQUFBLENBQUEsVUFBQSxDQUFBLENBQUE7OztBQUdBLEtBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUE7QUFDQSxNQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsS0FBQTtBQUNBLFVBQUEsRUFBQSxLQUFBO0FBQ0EsWUFBQSxFQUFBLEtBQUE7QUFDQSxTQUFBLEVBQUEsS0FBQTtHQUNBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLFVBQUE7R0FDQTtFQUNBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxVQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7O0FBRUEsS0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLE1BQUEsYUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFFBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtFQUNBO0FBQ0EsS0FBQSxNQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsRUFBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTs7QUFFQSxNQUFBLGFBQUEsRUFBQSxZQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxNQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsSUFBQSxHQUFBLENBQUEsQ0FBQSxTQUFBLENBQUE7QUFDQSxNQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsS0FBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQTs7QUFFQSxRQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxPQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsa0JBQUEsR0FBQSxZQUFBO0FBQ0EsTUFBQSxNQUFBLENBQUEsV0FBQSxJQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxJQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxDQUFBLFFBQUEsRUFBQSxPQUFBLFNBQUEsQ0FBQTtBQUNBLFNBQUEsU0FBQSxDQUFBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN2SkEsR0FBQSxDQUFBLE9BQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBOztBQUVBLFFBQUE7O0FBRUEsY0FBQSxFQUFBLHdCQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLHFCQUFBLE9BQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsT0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxlQUFBLEVBQUEsdUJBQUEsTUFBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLHlCQUFBLEdBQUEsTUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxTQUFBLEVBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLE1BQUEsR0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxjQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxZQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxVQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN2Q0EsR0FBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLE9BQUEsRUFBQTtBQUNBLE9BQUEsRUFBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLEdBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSxtREFBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxRQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxPQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLGVBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsVUFBQSxFQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsZUFBQSxDQUFBLE1BQUEsRUFBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7R0FFQTtFQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7QUMvQkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsWUFBQTtBQUNBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQSx5REFBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNMQSxHQUFBLENBQUEsU0FBQSxDQUFBLFFBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxPQUFBLEVBQUE7QUFDQSxPQUFBLEVBQUEsR0FBQTtBQUNBLFlBQUEsRUFBQSxHQUFBO0dBQ0E7QUFDQSxhQUFBLEVBQUEseUNBQUE7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7O0FBRUEsUUFBQSxDQUFBLEtBQUEsR0FBQSxDQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsRUFDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLFFBQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLENBQ0EsQ0FBQTs7QUFFQSxRQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsVUFBQSxHQUFBLFlBQUE7QUFDQSxXQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsT0FBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSxlQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLE9BQUEsVUFBQSxHQUFBLFNBQUEsVUFBQSxHQUFBO0FBQ0EsU0FBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLFVBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsRUFBQSxPQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTs7O0FBR0EsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBO0FBQ0EsUUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsR0FBQSxHQUFBLEVBQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxRQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxJQUFBLENBQUEsWUFBQTtBQUNBLEtBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBLElBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQTtBQUNBLGVBQUEsRUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUE7TUFDQSxFQUFBLElBQUEsRUFBQSxlQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEVBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUVBOztFQUVBLENBQUE7Q0FFQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIFxuXG4gICAgICAgIHRoaXMuc2lnbnVwID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICAvL3NlbmRzIGEgcG9zdCByZXF1ZXN0IGNvbnRhaW5pbmcgdGhlIHVzZXIncyBjcmVkZW50aWFscyB0byBcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCdhcGkvdXNlcnMvc2lnbnVwJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLy9vbmNlIHRoZSB1c2VyIGhhcyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuLi5cbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvL2Egc2Vjb25kIHBvc3QgcmVxdWVzdCBpcyBjcmVhdGVkIHRvIGxvZyB0aGUgdXNlciBpblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIHNpZ251cCBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uIChzZXNzaW9uSWQsIHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KSgpO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9ob21lL2hvbWUuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdIb21lQ3RybCcsXG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIHJlcXVlc3RlZFVzZXI6IGZ1bmN0aW9uKEF1dGhTZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCByZXF1ZXN0ZWRVc2VyKSB7XG4gICAgLy8gSWYgdGhlcmUncyBhIGxvZ2dlZCBpbiB1c2VyIHVwb24gbG9hZCwgZ28gdG8gdGhlIGRhc2hib2FyZFxuICAgIGlmIChyZXF1ZXN0ZWRVc2VyKSAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHJlcXVlc3RlZFVzZXIuX2lkfSk7XG5cbiAgICAkc2NvcGUuaG9tZSA9IHRydWU7IC8vIFRvIGtub3cgd2hhdCBuYXYgbGlua3MgdG8gc2hvd1xuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5zaWdudXAgPSB7fTtcbiAgICAkc2NvcGUubG9naW5FcnJvciA9IG51bGw7XG4gICAgJHNjb3BlLnNpZ251cEVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UubG9naW4obG9naW5JbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5sb2dpbkVycm9yID0gXCJJIHRoaW5rIHlvdVxcJ3ZlIGVudGVyZWQgdGhlIHdyb25nIGluZm8sIGZyaWVuZFwiO1xuICAgICAgICB9KTtcblxuICAgIH07XG5cbiAgICAkc2NvcGUuc2VuZFNpZ251cCA9IGZ1bmN0aW9uKHNpZ251cEluZm8pIHtcbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcbiAgICAgICAgQXV0aFNlcnZpY2Uuc2lnbnVwKHNpZ251cEluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAkc2NvcGUuc2lnbnVwRXJyb3IgPSBcIkknbSBhZnJhaWQgd2UgYWxyZWFkeSBoYXZlIHNvbWVvbmUgYnkgdGhhdCBuYW1lXCI7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBQYXJhbGF4IGVmZmVjdCBmb3IgaW1hZ2VzXG4gICAgJChmdW5jdGlvbigpIHtcbiAgICAvLyBDYWNoZSB0aGUgd2luZG93IG9iamVjdCAobWFrZXMgbG9hZCB0aW1lIGZhc3RlcilcbiAgICB2YXIgJHdpbmRvdyA9ICQod2luZG93KTtcbiAgICAvLyBQYXJhbGxheCBiYWNrZ3JvdW5kIGVmZmVjdFxuICAgICQoJ3NlY3Rpb25bZGF0YS10eXBlPVwiYmFja2dyb3VuZFwiXScpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciAkYmdvYmogPSAkKHRoaXMpOyAvLyBhc3NpZ25pbmcgdGhlIG9iamVjdFxuICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy9zY3JvbGwgdGhlIGJhY2tncm91bmQgYXQgdmFyIHNwZWVkXG4gICAgICAgICAgICAvLyB0aGUgeVBvcyBpcyBhIG5lZ2F0aXZlIGJlY2F1c2Ugd2UncmUgc2Nyb2xsaW5nIGl0IHVwXG4gICAgICAgICAgICB2YXIgeVBvcyA9IC0oJHdpbmRvdy5zY3JvbGxUb3AoKSAvICRiZ29iai5kYXRhKCdzcGVlZCcpKTtcbiAgICAgICAgICAgIC8vIFB1dCB0b2dldGhlciBvdXIgZmluYWwgYmFja2dyb3VuZCBwb3NpdGlvblxuICAgICAgICAgICAgdmFyIGNvb3JkcyA9ICc1MCUgJyArIHlQb3MgKyAncHgnO1xuICAgICAgICAgICAgLy8gTW92ZSB0aGUgYmFja2dyb3VuZFxuICAgICAgICAgICAgJGJnb2JqLmNzcyh7IGJhY2tncm91bmRQb3NpdGlvbjogY29vcmRzIH0pO1xuICAgICAgICB9KTsgLy8gZW5kIHdpbmRvdyBzY3JvbGxcbiAgICB9KTtcbn0pO1xuXG5cblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yJyxcblx0XHR7XG5cdFx0XHR1cmw6ICcvZWRpdG9yLzppZCcsXG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LWVkaXRvci9lZGl0b3IuaHRtbCcsXG5cdFx0XHRjb250cm9sbGVyOiAnRWRpdG9yQ3RybCcsXG5cdFx0ICAgIHJlc29sdmU6IHtcblx0XHQgICAgXHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdCAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkO1xuXHRcdCAgICBcdH1cblx0XHQgICAgfSxcblx0XHRcdGRhdGE6IHtcblx0ICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcblx0ICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0VkaXRvckN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGVQYXJhbXMsICR1aWJNb2RhbCwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5LCBBdXRoU2VydmljZSkge1xuXHQvL3ZhcmlhYmxlIHNhdmVkIHRvIHNob3cvaGlkZSBxdWVzdCBlZGl0b3Igd2hlbiBlZGl0aW5nIGluZGl2aWR1YWwgc3RhdGVzXG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkc2NvcGUudmlld01haW5NYXAgPSB0cnVlO1xuXHQkc2NvcGUubmV3UXVlc3QgPSBmYWxzZTtcblx0Ly9pZiB0aGVyZSBpcyBubyBuZXcgcXVlc3QsIHNldCBwcm9wZXJ0aWVzIFxuXHRpZighcXVlc3QpIHtcblx0XHQkc2NvcGUubmV3UXVlc3QgPSB0cnVlO1xuXHRcdCRzY29wZS5xdWVzdD0ge1xuXHRcdFx0c3RhcnQ6ICBbNDAuNzIzMDA4LC03NC4wMDA2MzI3XVxuXHRcdH07XG5cdH1cblxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoc2F2ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7aWQ6IHNhdmVkUXVlc3QuX2lkLCBxdWVzdFN0ZXBJZDogbnVsbH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdCRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ291dCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHR2YXIgdGFyZ2V0Q2lyY2xlcyA9IFtdO1xuXHR2YXIgY2lyY2xlQ2VudGVycyA9IFtdO1xuXHR2YXIgcXVlc3RNYXAgPSBMLm1hcCgncXVlc3QtbWFwJykuc2V0VmlldyhbNDAuNzIzMDA4LC03NC4wMDA2MzI3XSwgMTMpO1xuXHRxdWVzdE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0TWFwKTtcblxuXHQvLyBJZiB0aGVyZSBhcmUgbm8gdGFyZ2V0Q2lyY2xlcyB5ZXQgY3JlYXRlZCwgc2V0IG1hcCB2aWV3IHRvIHVzZXIncyBsb2NhdGlvblxuXHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUpIHtcblxuXHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdHVzZXJMb2NhdGlvbiA9IFtlLmxhdGl0dWRlLGUubG9uZ2l0dWRlXTtcblx0XHRcdHF1ZXN0TWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSZWRyYXcgYWxsIHRhcmdldENpcmNsZXMgZm9yIHRoZSBxdWVzdCBvbiB0aGUgbWFwIGFuZCByZXNldCB0aGUgYm91bmRzXG5cdGZ1bmN0aW9uIGRyYXdDaXJjbGVzKCkge1xuXHRcdC8vIFJlbW92ZSBhbGwgY2lyY2xlc1xuXHRcdHRhcmdldENpcmNsZXMuZm9yRWFjaChmdW5jdGlvbihjaXJjbGUpIHtcblx0XHRcdHF1ZXN0TWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG5cdFx0fSk7XG5cdFx0Ly8gRHJhdyBhIGNpcmNsZSBmb3IgZXZlcnkgdGFyZ2V0Q2lyY2xlIGluIHRoZSBxdWVzdFxuXHRcdGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goZnVuY3Rpb24oc3RlcCwgaW5kZXgpIHtcblx0XHRcdFx0aWYgKHN0ZXAudGFyZ2V0Q2lyY2xlICYmIHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHR2YXIgY2VudGVyID0gc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyO1xuXHRcdFx0XHRcdHZhciByYWRpdXMgPSBzdGVwLnRhcmdldENpcmNsZS5yYWRpdXM7XG5cdFx0XHRcdFx0dmFyIGNpcmNsZSA9IEwuY2lyY2xlKGNlbnRlcixyYWRpdXMpO1xuXHRcdFx0XHRcdGNpcmNsZS5iaW5kTGFiZWwoKGluZGV4KzEpLnRvU3RyaW5nKCksIHsgbm9IaWRlOiB0cnVlIH0pLmFkZFRvKHF1ZXN0TWFwKTtcblx0XHRcdFx0XHR0YXJnZXRDaXJjbGVzLnB1c2goY2lyY2xlKTtcblx0XHRcdFx0XHRjaXJjbGVDZW50ZXJzLnB1c2goc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRxdWVzdE1hcC5maXRCb3VuZHMoY2lyY2xlQ2VudGVycyk7XG5cdFx0fVxuXHR9XG5cdGRyYXdDaXJjbGVzKCk7XG5cbn0pO1xuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkYXNoYm9hcmQnLHtcblx0XHR1cmw6ICcvZGFzaGJvYXJkLzp1c2VySWQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvdXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdEYXNoQ3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0dXNlclF1ZXN0czogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LmdldFVzZXJRdWVzdHMoJHN0YXRlUGFyYW1zLnVzZXJJZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRGFzaEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlLCAkc2NvcGUsIHVzZXJRdWVzdHMsIFNlc3Npb24sIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5kYXNoYm9hcmQgPSB0cnVlO1xuXHQkc2NvcGUucXVlc3RzID0gW107XG5cdCRzY29wZS5xdWVzdHMgPSB1c2VyUXVlc3RzLm1hcChmdW5jdGlvbihnKSB7IFxuXHRcdGcuc2hvd0RldGFpbCA9IGZhbHNlO1xuXHRcdHJldHVybiBnO1xuXHR9KTtcblxuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZVF1ZXN0ID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZGVsZXRlKHF1ZXN0Q2xpY2tlZClcblx0XHQudGhlbiggZnVuY3Rpb24gKGRlbGV0ZWRRdWVzdCkge1xuXHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pO1xuXHR9O1xuXHQkc2NvcGUucGFyZW50Q2xpY2sgPSBmdW5jdGlvbihpbmRleCkge1xuXHRcdHZhciBxdWVzdCA9ICRzY29wZS5xdWVzdHNbaW5kZXhdO1xuXHRcdHF1ZXN0LnNob3dEZXRhaWwgPSAhcXVlc3Quc2hvd0RldGFpbDtcblx0fTtcblx0JHNjb3BlLnN3aXRjaEFjdGl2ZSA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZShxdWVzdENsaWNrZWQpO1xuXHR9O1xufSk7XG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG4kc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yLnF1ZXN0U3RlcCcsIHtcblx0XHR1cmw6ICcvcXVlc3RzdGVwLzpxdWVzdFN0ZXBJZCcsIFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3Qtc3RlcC1lZGl0b3IvcXVlc3Qtc3RlcC1lZGl0b3IuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ1F1ZXN0U3RlcEVkaXRDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdHVuZGVmaW5lZDtcbiAgICBcdFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgXHRcdGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgIFx0fVxuXHR9KTtcbn0pO1xuXG5cbmFwcC5jb250cm9sbGVyKCdRdWVzdFN0ZXBFZGl0Q3RybCcsIGZ1bmN0aW9uICgkc3RhdGVQYXJhbXMsICRzY29wZSwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHQkc2NvcGUudmlld01hcCA9IHRydWU7XG5cdHZhciB1c2VyTG9jYXRpb247XG5cblx0Ly9kZWZpbmQgbmV3IFN0ZXAgZm9yIGFkZGluZyB0byBzdGVwcyBhcnJheVxuXHQkc2NvcGUubmV3U3RlcCA9IHtcblx0XHRuYW1lOiAnTmV3IFN0ZXAnLFxuXHRcdHRhcmdldENpcmNsZToge1xuXHRcdFx0XHRjZW50ZXI6IFtdLFxuXHRcdFx0XHRyYWRpdXM6IG51bGxcblx0XHRcdH1cblx0XHR9XHRcblx0Ly9pZiB3ZSBoYXZlIHN0ZXBzLCBmaW5kIHRoZSBpbmRleCBvZiB0aGUgc3RlcCB0aGF0IG1hdGNoZXMgdGhlIHBhcmFtc1xuXHRpZigkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGggPiAwKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZm9yRWFjaCggZnVuY3Rpb24gKHN0ZXAsIGluZGV4KSB7XG5cdFx0XHRpZiAoc3RlcC5faWQgPT09ICRzdGF0ZVBhcmFtcy5xdWVzdFN0ZXBJZCkge1xuXHRcdFx0XHQkc2NvcGUucXVlc3QuaWR4ID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Ly9zZXRzIGN1cnJlbnRTdGVwIHRvIHRoYXQgbWF0Y2hpbmcgdGhlIHBhcmFtZXRlcnNcblx0XHQkc2NvcGUuY3VycmVudFN0ZXAgPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1skc2NvcGUucXVlc3QuaWR4XTtcblx0fSBlbHNlIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5wdXNoKCRzY29wZS5uZXdTdGVwKTtcblx0XHQkc2NvcGUuY3VycmVudFN0ZXAgPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXVxuXHR9XG5cdC8vZnVuY3Rpb24gdG8gc3dpdGNoIHN0YXRlcyB3aXRoaW4gbWFwU3RhdGUgZWRpdG9yXG5cdCRzY29wZS5zd2l0Y2hTdGVwID0gZnVuY3Rpb24gKGNsaWNrZWRTdGVwKSB7XG5cdFx0UXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHQvLyByZWRpcmVjdCB0byB0aGUgY2xpY2tlZCBtYXBzdGF0ZVxuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBjbGlja2VkU3RlcC5faWR9KTtcdFxuXHRcdH0pXG5cdH07XG5cdCRzY29wZS5zYXZlUXVlc3RTdGVwcyA9IGZ1bmN0aW9uICgpIHtcblx0Ly91cGRhdGVzIGN1cnJlbnQgbWFwU3RhdGVcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6ICRzY29wZS5xdWVzdC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XHRcblx0XHR9KVxuXHR9O1xuXHQkc2NvcGUucmV0dXJuV2l0aG91dFNhdmluZyA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiAkc2NvcGUucXVlc3QuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1x0XG5cdH07XG5cdCRzY29wZS5hZGRRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1skc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgtMV0uX2lkfSk7XG5cdFx0fSlcblxuXHR9O1xuXHQkc2NvcGUucmVtb3ZlUXVlc3RTdGVwID0gZnVuY3Rpb24gKCkge1xuXHRcdHZhciBpbmRleCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmluZGV4T2YoJHNjb3BlLmN1cnJlbnRTdGVwKTtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdGlmIChpbmRleCA9PT0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoKSBpbmRleC0tO1xuXHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdHZhciBzdGVwRGVzdGluYXRpb24gPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGg9PT0wID8gbnVsbCA6ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzW2luZGV4XS5faWQ7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IHN0ZXBEZXN0aW5hdGlvbn0sIHtyZWxvYWQ6IHRydWV9KTtcblx0XHR9KTtcblx0fTtcblxuXHQvLyBpbml0aWFsaXplIG1hcFxuXHR2YXIgcXVlc3RTdGVwTWFwID0gTC5tYXAoJ3F1ZXN0LXN0ZXAtbWFwJyk7XG5cdHF1ZXN0U3RlcE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0Ly9hZGQgcGlyYXRlIG1hcCB0aWxlc1xuXHRMLnRpbGVMYXllcignaHR0cHM6Ly9hcGkudGlsZXMubWFwYm94LmNvbS92NC97aWR9L3t6fS97eH0ve3l9LnBuZz9hY2Nlc3NfdG9rZW49e2FjY2Vzc1Rva2VufScsIHtcbiAgICBtYXhab29tOiAxOCxcbiAgICBpZDogJ3Njb3R0ZWdncy5vNzYxNGpsMicsXG4gICAgYWNjZXNzVG9rZW46ICdway5leUoxSWpvaWMyTnZkSFJsWjJkeklpd2lZU0k2SW1OcGFEWm9aemhtZGpCak1EWjFjV281YUdjeWFYbHRlVGtpZlEuTFplMC1JQlJRbVowUGtRQnNZSWxpdydcblx0fSkuYWRkVG8ocXVlc3RTdGVwTWFwKTtcblxuXHQvLyBTZXQgdmlldyB1c2luZyB0YXJnZXRDaXJjbGUgZm9yIHRoaXMgc3RlcCBpZiBkZWZpbmVkXG5cdC8vIFRoZW4gdHJ5IGZpcnN0IHRhcmdldENpcmNsZSBmb3IgcXVlc3QgaWYgZGVmaW5lZFxuXHQvLyBPdGhlcndpc2UgZ2V0IHVzZXIncyBsb2NhdGlvbiBhbmQgc2V0IG1hcCB2aWV3IHdpdGggdGhhdFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHF1ZXN0U3RlcE1hcC5zZXRWaWV3KCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIHtcblx0XHRxdWVzdFN0ZXBNYXAubG9jYXRlKCkub24oJ2xvY2F0aW9uZm91bmQnLCBmdW5jdGlvbiAoZSkge1xuXHRcdFx0dXNlckxvY2F0aW9uID0gW2UubGF0aXR1ZGUsZS5sb25naXR1ZGVdO1xuXHRcdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIHRoZSBGZWF0dXJlR3JvdXAgdG8gc3RvcmUgZWRpdGFibGUgbGF5ZXJzXG5cdHZhciBkcmF3bkl0ZW1zID0gbmV3IEwuRmVhdHVyZUdyb3VwKCk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcblxuXHQvLyBJbml0aWFsaXplIHRoZSBkcmF3IGNvbnRyb2wgYW5kIHBhc3MgaXQgdGhlIEZlYXR1cmVHcm91cCBvZiBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0ICAgIGRyYXc6IHtcblx0ICAgIFx0cG9seWxpbmU6IGZhbHNlLFxuXHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0ICAgIFx0cmVjdGFuZ2xlOiBmYWxzZSxcblx0ICAgIFx0bWFya2VyOiBmYWxzZVxuXHQgICAgfSxcblx0ICAgIGVkaXQ6IHtcblx0ICAgICAgICBmZWF0dXJlR3JvdXA6IGRyYXduSXRlbXNcblx0ICAgIH1cblx0fSk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRDb250cm9sKGRyYXdDb250cm9sKTtcblx0Ly9pZiB0aGVyZSBpcyBhIHRhcmdldCByZWdpb24sIGRyYXcgaXQgb24gdGhlIG1hcFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0dmFyIGN1cnJlbnRSZWdpb24gPSBMLmNpcmNsZSgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciwkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyk7XG5cdFx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGN1cnJlbnRSZWdpb24pO1xuXHR9XG5cdHZhciBjaXJjbGU7XG5cdHF1ZXN0U3RlcE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0Ly9yZW1vdmUgdGhlIGxvYWRlZCByZWdpb24gdGhlbiByZW1vdmUgYW55IG5ld2x5IGRyYXduIGNpcmNsZXNcbiAgXHRpZihjdXJyZW50UmVnaW9uKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY3VycmVudFJlZ2lvbik7XG4gIFx0aWYoY2lyY2xlKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY2lyY2xlKTtcbiAgXHR2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuICBcdHZhciBsYXllciA9IGUubGF5ZXI7XG4gIFx0Ly9hc3NpZ24gdGFyZ2V0IHJlZ2lvbiB0byBwcm9wZXJ0aWVzIG9mIGRyYXduIG9iamVjdFxuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyID0gW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXTtcbiAgICAkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyA9IGxheWVyLl9tUmFkaXVzO1xuICAgIC8vZGVjbGFyZSBuZXcgb2JqZWN0IGJhc2VkIG9uIHByb3BlcnRpZWQgZHJhd24gYW5kIGFkZCB0byBtYXBcbiAgICBjaXJjbGUgPSBMLmNpcmNsZShbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCBsYXllci5fbVJhZGl1cyk7XG4gICAgcXVlc3RTdGVwTWFwLmFkZExheWVyKGNpcmNsZSk7XG5cdH0pO1xuXG5cdCRzY29wZS5nZXRNb2RhbEJ1dHRvblRleHQgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8ucXVlc3Rpb24pIHJldHVybiBcIlN1Ym1pdCFcIjtcblx0XHRyZXR1cm4gXCJHb3QgaXQhXCI7XG5cdH07XG59KTtcblxuXG5cbiIsImFwcC5mYWN0b3J5KCdRdWVzdEZhY3RvcnknLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24pIHtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsUXVlc3RzOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzJylcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldE9uZVF1ZXN0OiBmdW5jdGlvbihxdWVzdElkKXtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdElkKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbihyZXMpe1xuXHRcdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdFx0fSk7XG5cdFx0fSxcblx0XHRnZXRVc2VyUXVlc3RzOiBmdW5jdGlvbih1c2VySWQpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzL3VzZXJxdWVzdHMvJyArIHVzZXJJZClcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAucHV0KCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpe1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdHNhdmVOZXc6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cXVlc3QuYXV0aG9yID0gU2Vzc2lvbi51c2VyLl9pZDtcblx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL3F1ZXN0cy8nLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRkZWxldGU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmRlbGV0ZSgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCk7XG5cdFx0fVxuXHR9O1xufSk7XG4iLCJhcHAuZGlyZWN0aXZlKCdibHVlSGVhZGVyJywgZnVuY3Rpb24oQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXHRcblx0cmV0dXJuIHtcblx0XHRyZXN0cmljdDogJ0UnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRoZWFkOiAnQCcsXG5cdFx0XHRzbWFsbDogJ0AnXG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2JsdWUtaGVhZGVyL2JsdWUtaGVhZGVyLmh0bWwnLFxuXHRcdGxpbms6IGZ1bmN0aW9uKHNjb3BlKSB7XG5cblx0XHRcdHNjb3BlLnVzZXIgPSBudWxsO1xuXG5cdFx0XHR2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG5cdFx0XHRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0QXV0aFNlcnZpY2UubG9nb3V0KClcblx0XHRcdFx0LnRoZW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdob21lJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdH1cblx0fTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGhvbWU6ICc9JyxcbiAgICAgICAgICAgIGRhc2hib2FyZDogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gUHJldHR5IFNjcm9sbGluZyBOYXZiYXIgRWZmZWN0XG4gICAgICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICgkKCcubmF2YmFyJykub2Zmc2V0KCkudG9wID4gNTAgJiYgc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLmFkZENsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdkb29vb3d3d3d3bicpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzY29wZS5ob21lKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykucmVtb3ZlQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ3V1dXV1dXVwJylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQW5pbWF0ZWQgU2Nyb2xsIFRvIFNlY3Rpb25cbiAgICAgICAgICAgICQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnLnBhZ2Utc2Nyb2xsIGEnKS5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICQoJ2h0bWwsIGJvZHknKS5zdG9wKCkuYW5pbWF0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6ICQoJGFuY2hvci5hdHRyKCdocmVmJykpLm9mZnNldCgpLnRvcFxuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwLCAnZWFzZUluT3V0RXhwbycpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG4gICAgfTtcblxufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
