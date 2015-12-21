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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwiaG9tZS9ob21lLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLEVBQ0E7QUFDQSxLQUFBLEVBQUEsYUFBQTtBQUNBLGFBQUEsRUFBQSw2QkFBQTtBQUNBLFlBQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsWUFBQSxFQUFBLFNBQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxXQUFBLENBQUEsYUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxLQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsUUFBQSxHQUFBLEtBQUEsQ0FBQTs7QUFFQSxLQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLFFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUNBOzs7QUFHQSxPQUFBLENBQUEsU0FBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsMEJBQUEsR0FBQSxZQUFBO0FBQ0EsTUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsUUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7S0FDQSxNQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7S0FDQTtBQUNBLFVBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsTUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsVUFBQSxDQUFBLEdBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsS0FBQSxZQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLFFBQUEsR0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLFNBQUEsRUFBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtBQUNBLEVBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsSUFBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLDhGQUFBO0VBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTs7O0FBR0EsS0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxFQUFBOztBQUVBLFVBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsZUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsT0FBQSxDQUFBLFlBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBOzs7QUFHQSxVQUFBLFdBQUEsR0FBQTs7QUFFQSxlQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTs7QUFFQSxNQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLElBQUEsQ0FBQSxZQUFBLElBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLFNBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0E7QUFDQSxZQUFBLEVBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUN0SEEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxLQUFBLENBQUEsa0JBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSx5QkFBQTtBQUNBLGFBQUEsRUFBQSw2Q0FBQTtBQUNBLFlBQUEsRUFBQSxtQkFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLFFBQUEsRUFBQSxlQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTtJQUNBO0dBQ0E7QUFDQSxNQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsSUFBQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxVQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLFlBQUEsRUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxPQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsS0FBQSxZQUFBLENBQUE7OztBQUdBLE9BQUEsQ0FBQSxPQUFBLEdBQUE7QUFDQSxNQUFBLEVBQUEsVUFBQTtBQUNBLGNBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLE9BQUEsSUFBQSxDQUFBLEdBQUEsS0FBQSxZQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0VBQ0E7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBOztBQUVBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxXQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsY0FBQSxHQUFBLFlBQUE7O0FBRUEsY0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLG1CQUFBLEdBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsWUFBQSxHQUFBLFlBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUVBLENBQUE7QUFDQSxPQUFBLENBQUEsZUFBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLEtBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsRUFBQSxDQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsS0FBQSxLQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsRUFBQSxLQUFBLEVBQUEsQ0FBQTtBQUNBLFNBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxPQUFBLGVBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxHQUFBLElBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsZUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7OztBQUdBLEtBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTs7QUFFQSxFQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLElBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSw4RkFBQTtFQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7Ozs7O0FBS0EsS0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQSxJQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsRUFBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTtBQUNBLGVBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLE9BQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQTs7O0FBR0EsS0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLEtBQUE7QUFDQSxVQUFBLEVBQUEsS0FBQTtBQUNBLFlBQUEsRUFBQSxLQUFBO0FBQ0EsU0FBQSxFQUFBLEtBQUE7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxVQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxNQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7RUFDQTtBQUNBLEtBQUEsTUFBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsTUFBQSxhQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsTUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLElBQUEsR0FBQSxDQUFBLENBQUEsU0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUE7O0FBRUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLGtCQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxRQUFBLEVBQUEsT0FBQSxTQUFBLENBQUE7QUFDQSxTQUFBLFNBQUEsQ0FBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDdkpBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7O0FBRUEsZUFBQSxDQUFBLEtBQUEsQ0FBQSxNQUFBLEVBQUE7QUFDQSxLQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQSxtQkFBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsZ0JBQUEsRUFBQSx1QkFBQSxXQUFBLEVBQUE7QUFDQSxXQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQTtJQUNBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQSxhQUFBLEVBQUE7O0FBRUEsS0FBQSxhQUFBLEVBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsU0FBQSxHQUFBLFVBQUEsU0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsYUFBQSxDQUFBLEtBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsU0FBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsVUFBQSxHQUFBLGdEQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFdBQUEsR0FBQSxpREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsRUFBQSxDQUFBLFlBQUE7O0FBRUEsTUFBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxpQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxPQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLFFBQUEsSUFBQSxHQUFBLEVBQUEsT0FBQSxDQUFBLFNBQUEsRUFBQSxHQUFBLE1BQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsR0FBQSxNQUFBLEdBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDbEVBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSxrQ0FBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsYUFBQSxFQUFBLG9CQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxhQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLFNBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsVUFBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsRUFBQTtBQUNBLEdBQUEsQ0FBQSxVQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFlBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLFlBQUEsVUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsS0FBQSxFQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN4Q0EsR0FBQSxDQUFBLE9BQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBOztBQUVBLFFBQUE7O0FBRUEsY0FBQSxFQUFBLHdCQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLHFCQUFBLE9BQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsT0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxlQUFBLEVBQUEsdUJBQUEsTUFBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLHlCQUFBLEdBQUEsTUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxTQUFBLEVBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLE1BQUEsR0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxjQUFBLEVBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxZQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxVQUFBLENBQUEsY0FBQSxHQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUN2Q0EsR0FBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBLEVBQUEsVUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLE9BQUEsRUFBQTtBQUNBLE9BQUEsRUFBQSxHQUFBO0FBQ0EsUUFBQSxFQUFBLEdBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSxtREFBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxRQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxPQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLGVBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsVUFBQSxFQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsZUFBQSxDQUFBLE1BQUEsRUFBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7R0FFQTtFQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7QUMvQkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsWUFBQTtBQUNBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQSx5REFBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNMQSxHQUFBLENBQUEsU0FBQSxDQUFBLFFBQUEsRUFBQSxVQUFBLFVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxPQUFBLEVBQUE7QUFDQSxPQUFBLEVBQUEsR0FBQTtBQUNBLFlBQUEsRUFBQSxHQUFBO0dBQ0E7QUFDQSxhQUFBLEVBQUEseUNBQUE7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7O0FBRUEsUUFBQSxDQUFBLEtBQUEsR0FBQSxDQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsRUFDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLFFBQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLENBQ0EsQ0FBQTs7QUFFQSxRQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsVUFBQSxHQUFBLFlBQUE7QUFDQSxXQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsT0FBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSxlQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLE9BQUEsVUFBQSxHQUFBLFNBQUEsVUFBQSxHQUFBO0FBQ0EsU0FBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLFVBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsRUFBQSxPQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGFBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLENBQUEsQ0FBQTs7O0FBR0EsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxZQUFBO0FBQ0EsUUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsR0FBQSxHQUFBLEVBQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxRQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLEdBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxJQUFBLENBQUEsWUFBQTtBQUNBLEtBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBLElBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQTtBQUNBLGVBQUEsRUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUE7TUFDQSxFQUFBLElBQUEsRUFBQSxlQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEVBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUVBOztFQUVBLENBQUE7Q0FFQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIFxuXG4gICAgICAgIHRoaXMuc2lnbnVwID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICAvL3NlbmRzIGEgcG9zdCByZXF1ZXN0IGNvbnRhaW5pbmcgdGhlIHVzZXIncyBjcmVkZW50aWFscyB0byBcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCdhcGkvdXNlcnMvc2lnbnVwJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLy9vbmNlIHRoZSB1c2VyIGhhcyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuLi5cbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvL2Egc2Vjb25kIHBvc3QgcmVxdWVzdCBpcyBjcmVhdGVkIHRvIGxvZyB0aGUgdXNlciBpblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIHNpZ251cCBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uIChzZXNzaW9uSWQsIHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KSgpO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yJyxcblx0XHR7XG5cdFx0XHR1cmw6ICcvZWRpdG9yLzppZCcsXG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LWVkaXRvci9lZGl0b3IuaHRtbCcsXG5cdFx0XHRjb250cm9sbGVyOiAnRWRpdG9yQ3RybCcsXG5cdFx0ICAgIHJlc29sdmU6IHtcblx0XHQgICAgXHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdCAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkO1xuXHRcdCAgICBcdH1cblx0XHQgICAgfSxcblx0XHRcdGRhdGE6IHtcblx0ICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcblx0ICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0VkaXRvckN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGVQYXJhbXMsICR1aWJNb2RhbCwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5LCBBdXRoU2VydmljZSkge1xuXHQvL3ZhcmlhYmxlIHNhdmVkIHRvIHNob3cvaGlkZSBxdWVzdCBlZGl0b3Igd2hlbiBlZGl0aW5nIGluZGl2aWR1YWwgc3RhdGVzXG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkc2NvcGUudmlld01haW5NYXAgPSB0cnVlO1xuXHQkc2NvcGUubmV3UXVlc3QgPSBmYWxzZTtcblx0Ly9pZiB0aGVyZSBpcyBubyBuZXcgcXVlc3QsIHNldCBwcm9wZXJ0aWVzIFxuXHRpZighcXVlc3QpIHtcblx0XHQkc2NvcGUubmV3UXVlc3QgPSB0cnVlO1xuXHRcdCRzY29wZS5xdWVzdD0ge1xuXHRcdFx0c3RhcnQ6ICBbNDAuNzIzMDA4LC03NC4wMDA2MzI3XVxuXHRcdH07XG5cdH1cblxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoc2F2ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7aWQ6IHNhdmVkUXVlc3QuX2lkLCBxdWVzdFN0ZXBJZDogbnVsbH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdCRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ291dCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHR2YXIgdGFyZ2V0Q2lyY2xlcyA9IFtdO1xuXHR2YXIgY2lyY2xlQ2VudGVycyA9IFtdO1xuXHR2YXIgcXVlc3RNYXAgPSBMLm1hcCgncXVlc3QtbWFwJykuc2V0VmlldyhbNDAuNzIzMDA4LC03NC4wMDA2MzI3XSwgMTMpO1xuXHRxdWVzdE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0TWFwKTtcblxuXHQvLyBJZiB0aGVyZSBhcmUgbm8gdGFyZ2V0Q2lyY2xlcyB5ZXQgY3JlYXRlZCwgc2V0IG1hcCB2aWV3IHRvIHVzZXIncyBsb2NhdGlvblxuXHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUpIHtcblxuXHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdHVzZXJMb2NhdGlvbiA9IFtlLmxhdGl0dWRlLGUubG9uZ2l0dWRlXTtcblx0XHRcdHF1ZXN0TWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSZWRyYXcgYWxsIHRhcmdldENpcmNsZXMgZm9yIHRoZSBxdWVzdCBvbiB0aGUgbWFwIGFuZCByZXNldCB0aGUgYm91bmRzXG5cdGZ1bmN0aW9uIGRyYXdDaXJjbGVzKCkge1xuXHRcdC8vIFJlbW92ZSBhbGwgY2lyY2xlc1xuXHRcdHRhcmdldENpcmNsZXMuZm9yRWFjaChmdW5jdGlvbihjaXJjbGUpIHtcblx0XHRcdHF1ZXN0TWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG5cdFx0fSk7XG5cdFx0Ly8gRHJhdyBhIGNpcmNsZSBmb3IgZXZlcnkgdGFyZ2V0Q2lyY2xlIGluIHRoZSBxdWVzdFxuXHRcdGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goZnVuY3Rpb24oc3RlcCwgaW5kZXgpIHtcblx0XHRcdFx0aWYgKHN0ZXAudGFyZ2V0Q2lyY2xlICYmIHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHR2YXIgY2VudGVyID0gc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyO1xuXHRcdFx0XHRcdHZhciByYWRpdXMgPSBzdGVwLnRhcmdldENpcmNsZS5yYWRpdXM7XG5cdFx0XHRcdFx0dmFyIGNpcmNsZSA9IEwuY2lyY2xlKGNlbnRlcixyYWRpdXMpO1xuXHRcdFx0XHRcdGNpcmNsZS5iaW5kTGFiZWwoKGluZGV4KzEpLnRvU3RyaW5nKCksIHsgbm9IaWRlOiB0cnVlIH0pLmFkZFRvKHF1ZXN0TWFwKTtcblx0XHRcdFx0XHR0YXJnZXRDaXJjbGVzLnB1c2goY2lyY2xlKTtcblx0XHRcdFx0XHRjaXJjbGVDZW50ZXJzLnB1c2goc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRxdWVzdE1hcC5maXRCb3VuZHMoY2lyY2xlQ2VudGVycyk7XG5cdFx0fVxuXHR9XG5cdGRyYXdDaXJjbGVzKCk7XG5cbn0pO1xuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2VkaXRvci5xdWVzdFN0ZXAnLCB7XG5cdFx0dXJsOiAnL3F1ZXN0c3RlcC86cXVlc3RTdGVwSWQnLCBcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdRdWVzdFN0ZXBFZGl0Q3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0cXVlc3Q6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcbiAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0UXVlc3RGYWN0b3J5LmdldE9uZVF1ZXN0KCRzdGF0ZVBhcmFtcy5pZCkgOiBcblx0XHRcdFx0XHR1bmRlZmluZWQ7XG4gICAgXHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgIFx0XHRhdXRoZW50aWNhdGU6IHRydWVcbiAgICBcdH1cblx0fSk7XG59KTtcblxuXG5hcHAuY29udHJvbGxlcignUXVlc3RTdGVwRWRpdEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlUGFyYW1zLCAkc2NvcGUsICRzdGF0ZSwgJHJvb3RTY29wZSwgcXVlc3QsIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkcm9vdFNjb3BlLmVkaXRvclZpc2libGUgPSBmYWxzZTtcblx0JHNjb3BlLnZpZXdNYXAgPSB0cnVlO1xuXHR2YXIgdXNlckxvY2F0aW9uO1xuXG5cdC8vZGVmaW5kIG5ldyBTdGVwIGZvciBhZGRpbmcgdG8gc3RlcHMgYXJyYXlcblx0JHNjb3BlLm5ld1N0ZXAgPSB7XG5cdFx0bmFtZTogJ05ldyBTdGVwJyxcblx0XHR0YXJnZXRDaXJjbGU6IHtcblx0XHRcdFx0Y2VudGVyOiBbXSxcblx0XHRcdFx0cmFkaXVzOiBudWxsXG5cdFx0XHR9XG5cdFx0fVx0XG5cdC8vaWYgd2UgaGF2ZSBzdGVwcywgZmluZCB0aGUgaW5kZXggb2YgdGhlIHN0ZXAgdGhhdCBtYXRjaGVzIHRoZSBwYXJhbXNcblx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID4gMCkge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goIGZ1bmN0aW9uIChzdGVwLCBpbmRleCkge1xuXHRcdFx0aWYgKHN0ZXAuX2lkID09PSAkc3RhdGVQYXJhbXMucXVlc3RTdGVwSWQpIHtcblx0XHRcdFx0JHNjb3BlLnF1ZXN0LmlkeCA9IGluZGV4O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdC8vc2V0cyBjdXJyZW50U3RlcCB0byB0aGF0IG1hdGNoaW5nIHRoZSBwYXJhbWV0ZXJzXG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LmlkeF07XG5cdH0gZWxzZSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF1cblx0fVxuXHQvL2Z1bmN0aW9uIHRvIHN3aXRjaCBzdGF0ZXMgd2l0aGluIG1hcFN0YXRlIGVkaXRvclxuXHQkc2NvcGUuc3dpdGNoU3RlcCA9IGZ1bmN0aW9uIChjbGlja2VkU3RlcCkge1xuXHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gcmVkaXJlY3QgdG8gdGhlIGNsaWNrZWQgbWFwc3RhdGVcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogY2xpY2tlZFN0ZXAuX2lkfSk7XHRcblx0XHR9KVxuXHR9O1xuXHQkc2NvcGUuc2F2ZVF1ZXN0U3RlcHMgPSBmdW5jdGlvbiAoKSB7XG5cdC8vdXBkYXRlcyBjdXJyZW50IG1hcFN0YXRlXG5cdFx0UXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiAkc2NvcGUucXVlc3QuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1x0XG5cdFx0fSlcblx0fTtcblx0JHNjb3BlLnJldHVybldpdGhvdXRTYXZpbmcgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHR9O1xuXHQkc2NvcGUuYWRkUXVlc3RTdGVwID0gZnVuY3Rpb24gKCkge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoLTFdLl9pZH0pO1xuXHRcdH0pXG5cblx0fTtcblx0JHNjb3BlLnJlbW92ZVF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaW5kZXggPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5pbmRleE9mKCRzY29wZS5jdXJyZW50U3RlcCk7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoaW5kZXggPT09ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCkgaW5kZXgtLTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHR2YXIgc3RlcERlc3RpbmF0aW9uID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoPT09MCA/IG51bGwgOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1tpbmRleF0uX2lkO1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBzdGVwRGVzdGluYXRpb259LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSk7XG5cdH07XG5cblx0Ly8gaW5pdGlhbGl6ZSBtYXBcblx0dmFyIHF1ZXN0U3RlcE1hcCA9IEwubWFwKCdxdWVzdC1zdGVwLW1hcCcpO1xuXHRxdWVzdFN0ZXBNYXAuc2Nyb2xsV2hlZWxab29tLmRpc2FibGUoKTsgLy8gUmVhbGx5IGFubm95aW5nIHdoZW4gaXQgaGFwcGVucyBhY2NpZGVudGx5XG5cdC8vYWRkIHBpcmF0ZSBtYXAgdGlsZXNcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0U3RlcE1hcCk7XG5cblx0Ly8gU2V0IHZpZXcgdXNpbmcgdGFyZ2V0Q2lyY2xlIGZvciB0aGlzIHN0ZXAgaWYgZGVmaW5lZFxuXHQvLyBUaGVuIHRyeSBmaXJzdCB0YXJnZXRDaXJjbGUgZm9yIHF1ZXN0IGlmIGRlZmluZWRcblx0Ly8gT3RoZXJ3aXNlIGdldCB1c2VyJ3MgbG9jYXRpb24gYW5kIHNldCBtYXAgdmlldyB3aXRoIHRoYXRcblx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHF1ZXN0U3RlcE1hcC5zZXRWaWV3KCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLCAxNSk7XG5cdH0gZWxzZSBpZiAoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0udGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHRxdWVzdFN0ZXBNYXAuc2V0Vmlldygkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUuY2VudGVyLCAxNSk7XG5cdH0gZWxzZSB7XG5cdFx0cXVlc3RTdGVwTWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdHVzZXJMb2NhdGlvbiA9IFtlLmxhdGl0dWRlLGUubG9uZ2l0dWRlXTtcblx0XHRcdHF1ZXN0U3RlcE1hcC5zZXRWaWV3KHVzZXJMb2NhdGlvbiwgMTUpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gSW5pdGlhbGl6ZSB0aGUgRmVhdHVyZUdyb3VwIHRvIHN0b3JlIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd25JdGVtcyA9IG5ldyBMLkZlYXR1cmVHcm91cCgpO1xuXHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoZHJhd25JdGVtcyk7XG5cblx0Ly8gSW5pdGlhbGl6ZSB0aGUgZHJhdyBjb250cm9sIGFuZCBwYXNzIGl0IHRoZSBGZWF0dXJlR3JvdXAgb2YgZWRpdGFibGUgbGF5ZXJzXG5cdHZhciBkcmF3Q29udHJvbCA9IG5ldyBMLkNvbnRyb2wuRHJhdyh7XG5cdCAgICBkcmF3OiB7XG5cdCAgICBcdHBvbHlsaW5lOiBmYWxzZSxcblx0ICAgIFx0cG9seWdvbjogZmFsc2UsXG5cdCAgICBcdHJlY3RhbmdsZTogZmFsc2UsXG5cdCAgICBcdG1hcmtlcjogZmFsc2Vcblx0ICAgIH0sXG5cdCAgICBlZGl0OiB7XG5cdCAgICAgICAgZmVhdHVyZUdyb3VwOiBkcmF3bkl0ZW1zXG5cdCAgICB9XG5cdH0pO1xuXHRxdWVzdFN0ZXBNYXAuYWRkQ29udHJvbChkcmF3Q29udHJvbCk7XG5cdC8vaWYgdGhlcmUgaXMgYSB0YXJnZXQgcmVnaW9uLCBkcmF3IGl0IG9uIHRoZSBtYXBcblx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHZhciBjdXJyZW50UmVnaW9uID0gTC5jaXJjbGUoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIsJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5yYWRpdXMpO1xuXHRcdHF1ZXN0U3RlcE1hcC5hZGRMYXllcihjdXJyZW50UmVnaW9uKTtcblx0fVxuXHR2YXIgY2lyY2xlO1xuXHRxdWVzdFN0ZXBNYXAub24oJ2RyYXc6Y3JlYXRlZCcsIGZ1bmN0aW9uIChlKSB7XG5cdC8vcmVtb3ZlIHRoZSBsb2FkZWQgcmVnaW9uIHRoZW4gcmVtb3ZlIGFueSBuZXdseSBkcmF3biBjaXJjbGVzXG4gIFx0aWYoY3VycmVudFJlZ2lvbikgcXVlc3RTdGVwTWFwLnJlbW92ZUxheWVyKGN1cnJlbnRSZWdpb24pO1xuICBcdGlmKGNpcmNsZSkgcXVlc3RTdGVwTWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG4gIFx0dmFyIHR5cGUgPSBlLmxheWVyVHlwZTtcbiAgXHR2YXIgbGF5ZXIgPSBlLmxheWVyO1xuICBcdC8vYXNzaWduIHRhcmdldCByZWdpb24gdG8gcHJvcGVydGllcyBvZiBkcmF3biBvYmplY3RcbiAgICAkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciA9IFtsYXllci5fbGF0bG5nLmxhdCxsYXllci5fbGF0bG5nLmxuZ107XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5yYWRpdXMgPSBsYXllci5fbVJhZGl1cztcbiAgICAvL2RlY2xhcmUgbmV3IG9iamVjdCBiYXNlZCBvbiBwcm9wZXJ0aWVkIGRyYXduIGFuZCBhZGQgdG8gbWFwXG4gICAgY2lyY2xlID0gTC5jaXJjbGUoW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXSwgbGF5ZXIuX21SYWRpdXMpO1xuICAgIHF1ZXN0U3RlcE1hcC5hZGRMYXllcihjaXJjbGUpO1xuXHR9KTtcblxuXHQkc2NvcGUuZ2V0TW9kYWxCdXR0b25UZXh0ID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcCAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8gJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvLnF1ZXN0aW9uKSByZXR1cm4gXCJTdWJtaXQhXCI7XG5cdFx0cmV0dXJuIFwiR290IGl0IVwiO1xuXHR9O1xufSk7XG5cblxuXG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuXG4gICAgJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2hvbWUnLCB7XG4gICAgICAgIHVybDogJy8nLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2hvbWUvaG9tZS5odG1sJyxcbiAgICAgICAgY29udHJvbGxlcjogJ0hvbWVDdHJsJyxcbiAgICAgICAgcmVzb2x2ZToge1xuICAgICAgICAgICAgcmVxdWVzdGVkVXNlcjogZnVuY3Rpb24oQXV0aFNlcnZpY2UpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9KTtcblxufSk7XG5cbmFwcC5jb250cm9sbGVyKCdIb21lQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsIEF1dGhTZXJ2aWNlLCAkc3RhdGUsIHJlcXVlc3RlZFVzZXIpIHtcbiAgICAvLyBJZiB0aGVyZSdzIGEgbG9nZ2VkIGluIHVzZXIgdXBvbiBsb2FkLCBnbyB0byB0aGUgZGFzaGJvYXJkXG4gICAgaWYgKHJlcXVlc3RlZFVzZXIpICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogcmVxdWVzdGVkVXNlci5faWR9KTtcblxuICAgICRzY29wZS5ob21lID0gdHJ1ZTsgLy8gVG8ga25vdyB3aGF0IG5hdiBsaW5rcyB0byBzaG93XG4gICAgJHNjb3BlLmxvZ2luID0ge307XG4gICAgJHNjb3BlLnNpZ251cCA9IHt9O1xuICAgICRzY29wZS5sb2dpbkVycm9yID0gbnVsbDtcbiAgICAkc2NvcGUuc2lnbnVwRXJyb3IgPSBudWxsO1xuXG4gICAgJHNjb3BlLnNlbmRMb2dpbiA9IGZ1bmN0aW9uIChsb2dpbkluZm8pIHtcbiAgICAgICAgJHNjb3BlLmVycm9yID0gbnVsbDtcblxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmxvZ2luRXJyb3IgPSBcIkkgdGhpbmsgeW91XFwndmUgZW50ZXJlZCB0aGUgd3JvbmcgaW5mbywgZnJpZW5kXCI7XG4gICAgICAgIH0pO1xuXG4gICAgfTtcblxuICAgICRzY29wZS5zZW5kU2lnbnVwID0gZnVuY3Rpb24oc2lnbnVwSW5mbykge1xuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuICAgICAgICBBdXRoU2VydmljZS5zaWdudXAoc2lnbnVwSW5mbykudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiB1c2VyLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICRzY29wZS5zaWdudXBFcnJvciA9IFwiSSdtIGFmcmFpZCB3ZSBhbHJlYWR5IGhhdmUgc29tZW9uZSBieSB0aGF0IG5hbWVcIjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIFBhcmFsYXggZWZmZWN0IGZvciBpbWFnZXNcbiAgICAkKGZ1bmN0aW9uKCkge1xuICAgIC8vIENhY2hlIHRoZSB3aW5kb3cgb2JqZWN0IChtYWtlcyBsb2FkIHRpbWUgZmFzdGVyKVxuICAgIHZhciAkd2luZG93ID0gJCh3aW5kb3cpO1xuICAgIC8vIFBhcmFsbGF4IGJhY2tncm91bmQgZWZmZWN0XG4gICAgJCgnc2VjdGlvbltkYXRhLXR5cGU9XCJiYWNrZ3JvdW5kXCJdJykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyICRiZ29iaiA9ICQodGhpcyk7IC8vIGFzc2lnbmluZyB0aGUgb2JqZWN0XG4gICAgICAgICQod2luZG93KS5zY3JvbGwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL3Njcm9sbCB0aGUgYmFja2dyb3VuZCBhdCB2YXIgc3BlZWRcbiAgICAgICAgICAgIC8vIHRoZSB5UG9zIGlzIGEgbmVnYXRpdmUgYmVjYXVzZSB3ZSdyZSBzY3JvbGxpbmcgaXQgdXBcbiAgICAgICAgICAgIHZhciB5UG9zID0gLSgkd2luZG93LnNjcm9sbFRvcCgpIC8gJGJnb2JqLmRhdGEoJ3NwZWVkJykpO1xuICAgICAgICAgICAgLy8gUHV0IHRvZ2V0aGVyIG91ciBmaW5hbCBiYWNrZ3JvdW5kIHBvc2l0aW9uXG4gICAgICAgICAgICB2YXIgY29vcmRzID0gJzUwJSAnICsgeVBvcyArICdweCc7XG4gICAgICAgICAgICAvLyBNb3ZlIHRoZSBiYWNrZ3JvdW5kXG4gICAgICAgICAgICAkYmdvYmouY3NzKHsgYmFja2dyb3VuZFBvc2l0aW9uOiBjb29yZHMgfSk7XG4gICAgICAgIH0pOyAvLyBlbmQgd2luZG93IHNjcm9sbFxuICAgIH0pO1xufSk7XG5cblxuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdkYXNoYm9hcmQnLHtcblx0XHR1cmw6ICcvZGFzaGJvYXJkLzp1c2VySWQnLFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvdXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdEYXNoQ3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0dXNlclF1ZXN0czogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LmdldFVzZXJRdWVzdHMoJHN0YXRlUGFyYW1zLnVzZXJJZCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcbiAgICAgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRGFzaEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlLCAkc2NvcGUsIHVzZXJRdWVzdHMsIFNlc3Npb24sIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5kYXNoYm9hcmQgPSB0cnVlO1xuXHQkc2NvcGUucXVlc3RzID0gW107XG5cdCRzY29wZS5xdWVzdHMgPSB1c2VyUXVlc3RzLm1hcChmdW5jdGlvbihnKSB7IFxuXHRcdGcuc2hvd0RldGFpbCA9IGZhbHNlO1xuXHRcdHJldHVybiBnO1xuXHR9KTtcblxuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZVF1ZXN0ID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZGVsZXRlKHF1ZXN0Q2xpY2tlZClcblx0XHQudGhlbiggZnVuY3Rpb24gKGRlbGV0ZWRRdWVzdCkge1xuXHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pO1xuXHR9O1xuXHQkc2NvcGUucGFyZW50Q2xpY2sgPSBmdW5jdGlvbihpbmRleCkge1xuXHRcdHZhciBxdWVzdCA9ICRzY29wZS5xdWVzdHNbaW5kZXhdO1xuXHRcdHF1ZXN0LnNob3dEZXRhaWwgPSAhcXVlc3Quc2hvd0RldGFpbDtcblx0fTtcblx0JHNjb3BlLnN3aXRjaEFjdGl2ZSA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZShxdWVzdENsaWNrZWQpO1xuXHR9O1xufSk7XG5cbiIsImFwcC5mYWN0b3J5KCdRdWVzdEZhY3RvcnknLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24pIHtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsUXVlc3RzOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzJylcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldE9uZVF1ZXN0OiBmdW5jdGlvbihxdWVzdElkKXtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdElkKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbihyZXMpe1xuXHRcdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdFx0fSk7XG5cdFx0fSxcblx0XHRnZXRVc2VyUXVlc3RzOiBmdW5jdGlvbih1c2VySWQpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzL3VzZXJxdWVzdHMvJyArIHVzZXJJZClcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAucHV0KCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpe1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdHNhdmVOZXc6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cXVlc3QuYXV0aG9yID0gU2Vzc2lvbi51c2VyLl9pZDtcblx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL3F1ZXN0cy8nLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRkZWxldGU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmRlbGV0ZSgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCk7XG5cdFx0fVxuXHR9O1xufSk7XG4iLCJhcHAuZGlyZWN0aXZlKCdibHVlSGVhZGVyJywgZnVuY3Rpb24oQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXHRcblx0cmV0dXJuIHtcblx0XHRyZXN0cmljdDogJ0UnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRoZWFkOiAnQCcsXG5cdFx0XHRzbWFsbDogJ0AnXG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2JsdWUtaGVhZGVyL2JsdWUtaGVhZGVyLmh0bWwnLFxuXHRcdGxpbms6IGZ1bmN0aW9uKHNjb3BlKSB7XG5cblx0XHRcdHNjb3BlLnVzZXIgPSBudWxsO1xuXG5cdFx0XHR2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG5cdFx0XHRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0QXV0aFNlcnZpY2UubG9nb3V0KClcblx0XHRcdFx0LnRoZW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdob21lJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdH1cblx0fTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ25hdmJhcicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgQVVUSF9FVkVOVFMsICRzdGF0ZSkge1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgcmVzdHJpY3Q6ICdFJyxcbiAgICAgICAgc2NvcGU6IHtcbiAgICAgICAgICAgIGhvbWU6ICc9JyxcbiAgICAgICAgICAgIGRhc2hib2FyZDogJz0nXG4gICAgICAgIH0sXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5odG1sJyxcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlKSB7XG5cbiAgICAgICAgICAgIHNjb3BlLml0ZW1zID0gW1xuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdEYXNoYm9hcmQnLCBzdGF0ZTogJ2hvbWUnICwgYXV0aDogdHJ1ZX0sXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ05ldyBRdWVzdCcsIHN0YXRlOiAnZWRpdG9yJywgYXV0aDogdHJ1ZSB9XG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcblxuICAgICAgICAgICAgc2NvcGUuaXNMb2dnZWRJbiA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHJlbW92ZVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ2luU3VjY2Vzcywgc2V0VXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzLCByZW1vdmVVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0LCByZW1vdmVVc2VyKTtcblxuICAgICAgICAgICAgLy8gUHJldHR5IFNjcm9sbGluZyBOYXZiYXIgRWZmZWN0XG4gICAgICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICgkKCcubmF2YmFyJykub2Zmc2V0KCkudG9wID4gNTAgJiYgc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLmFkZENsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdkb29vb3d3d3d3bicpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzY29wZS5ob21lKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykucmVtb3ZlQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ3V1dXV1dXVwJylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gQW5pbWF0ZWQgU2Nyb2xsIFRvIFNlY3Rpb25cbiAgICAgICAgICAgICQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnLnBhZ2Utc2Nyb2xsIGEnKS5iaW5kKCdjbGljaycsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQodGhpcyk7XG4gICAgICAgICAgICAgICAgICAgICQoJ2h0bWwsIGJvZHknKS5zdG9wKCkuYW5pbWF0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6ICQoJGFuY2hvci5hdHRyKCdocmVmJykpLm9mZnNldCgpLnRvcFxuICAgICAgICAgICAgICAgICAgICB9LCAxNTAwLCAnZWFzZUluT3V0RXhwbycpO1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuXG4gICAgfTtcblxufSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
