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
		console.log('loginInfo', loginInfo);
		AuthService.login(loginInfo).then(function (user) {
			console.log('found existing user', user);
			$state.go('dashboard', { userId: user._id });
		})['catch'](function () {
			$scope.loginError = "I think you\'ve entered the wrong info, friend";
		});
	};

	$scope.sendSignup = function (signupInfo) {
		console.log('loginInfo', signupInfo);
		$scope.error = null;
		AuthService.signup(signupInfo).then(function (user) {
			console.log('made new user', user);
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
	//if there is no quest, define one
	if (!quest) {
		$scope.newQuest = true;
		$scope.quest = {};
	}

	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {
		// filter out all questSteps without targetCirlcles or transitionInfo.title
		if ($scope.quest.questSteps) {
			$scope.quest.questSteps = $scope.quest.questSteps.filter(function (step) {
				return step.targetCircle.center.length && step.transitionInfo.title;
			});
		}

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
	if (!$scope.quest.questSteps || !$scope.quest.questSteps[0] || !$scope.quest.questSteps[0].targetCircle) {

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
		if ($scope.quest.questSteps) {
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
			if (circleCenters.length) questMap.fitBounds(circleCenters);
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
	$scope.targetError = false;
	$scope.titleError = false;

	//defind new Step for adding to steps array
	$scope.newStep = {
		name: 'New Step',
		targetCircle: {
			center: [],
			radius: null
		}
	};
	// if we have steps, find the index of the step that matches the params
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
		if ($scope.currentStep.targetCircle.center.length && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.title) {
			QuestFactory.save($scope.quest).then(function () {
				// redirect to the clicked mapstate
				$state.go('editor.questStep', { questStepId: clickedStep._id });
			});
		} else {
			if (!$scope.currentStep.targetCircle.center.length) flashError('targetError');
			if (!$scope.currentStep.transitionInfo || !$scope.currentStep.transitionInfo.title) flashError('titleError');
		}
	};
	$scope.saveQuestSteps = function () {
		if ($scope.currentStep.targetCircle.center.length) {
			//update quest
			QuestFactory.save($scope.quest).then(function (updatedQuest) {
				$scope.quest = updatedQuest;
				$state.go('editor', { id: $scope.quest._id }, { reload: true });
			});
		} else flashError('targetError');
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
			// If quest has no steps now, return to main editor
			if (!$scope.quest.questSteps.length) $state.go('editor', { id: $scope.quest._id }, { reload: true });else $state.go('editor.questStep', { questStepId: $scope.quest.questSteps[index]._id }, { reload: true });
		});
	};

	function flashError(errorType) {
		$scope[errorType] = true;
		setTimeout(function () {
			$scope[errorType] = false;
			$scope.$digest();
		}, 3000);
	}

	// MAP BELOW ===================================>>

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
				} else if (scope.home) {
					$('.navbar-fixed-top').removeClass('top-nav-collapse');
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

app.directive('resolveLoader', function ($rootScope, $timeout) {

	return {
		restrict: 'E',
		replace: true,
		template: '<div class="alert alert-success ng-hide"><strong>Loading up!</strong></div>',
		link: function link(scope, element) {
			$rootScope.$on('$stateChangeStart', function (event, currentRoute, previousRoute) {

				$timeout(function () {
					element.removeClass('ng-hide');
				});
			});

			$rootScope.$on('$stateChangeSuccess', function () {
				element.addClass('ng-hide');
			});
		}
	};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiaG9tZS9ob21lLmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2xvYWRpbmcvbG9hZGluZy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGVBQUEsQ0FBQSxLQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEsbUJBQUE7QUFDQSxZQUFBLEVBQUEsVUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLEtBQUEsYUFBQSxFQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLEVBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsS0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxHQUFBLENBQUEscUJBQUEsRUFBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxVQUFBLEdBQUEsZ0RBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxHQUFBLENBQUEsZUFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFdBQUEsR0FBQSxpREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsRUFBQSxDQUFBLFlBQUE7O0FBRUEsTUFBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxpQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxPQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLFFBQUEsSUFBQSxHQUFBLEVBQUEsT0FBQSxDQUFBLFNBQUEsRUFBQSxHQUFBLE1BQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsR0FBQSxNQUFBLEdBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDcEVBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsRUFDQTtBQUNBLEtBQUEsRUFBQSxhQUFBO0FBQ0EsYUFBQSxFQUFBLDZCQUFBO0FBQ0EsWUFBQSxFQUFBLFlBQUE7QUFDQSxTQUFBLEVBQUE7QUFDQSxRQUFBLEVBQUEsZUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsV0FBQSxZQUFBLENBQUEsRUFBQSxLQUFBLEVBQUEsR0FDQSxZQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxFQUFBLENBQUEsR0FDQSxTQUFBLENBQUE7SUFDQTtHQUNBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsU0FBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUEsV0FBQSxFQUFBOztBQUVBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxRQUFBLEdBQUEsS0FBQSxDQUFBOztBQUVBLEtBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsUUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsRUFBQSxDQUFBO0VBQ0E7OztBQUdBLE9BQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTs7QUFFQSxNQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLElBQUEsSUFBQSxDQUFBLGNBQUEsQ0FBQSxLQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTs7QUFFQSxNQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsMEJBQUEsR0FBQSxZQUFBO0FBQ0EsTUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsUUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7S0FDQSxNQUFBO0FBQ0EsV0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7S0FDQTtBQUNBLFVBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsTUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsVUFBQSxDQUFBLEdBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsS0FBQSxZQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLGFBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxLQUFBLFFBQUEsR0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBLFNBQUEsRUFBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtBQUNBLEVBQUEsQ0FBQSxTQUFBLENBQUEsaUZBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsSUFBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLDhGQUFBO0VBQ0EsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTs7O0FBR0EsS0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxZQUFBLEVBQUE7O0FBRUEsVUFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEVBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxlQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxPQUFBLENBQUEsWUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0E7OztBQUdBLFVBQUEsV0FBQSxHQUFBOztBQUVBLGVBQUEsQ0FBQSxPQUFBLENBQUEsVUFBQSxNQUFBLEVBQUE7QUFDQSxXQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxPQUFBLENBQUEsVUFBQSxJQUFBLEVBQUEsS0FBQSxFQUFBO0FBQ0EsUUFBQSxJQUFBLENBQUEsWUFBQSxJQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsRUFBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQTtJQUNBLENBQUEsQ0FBQTtBQUNBLE9BQUEsYUFBQSxDQUFBLE1BQUEsRUFBQSxRQUFBLENBQUEsU0FBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0dBQ0E7RUFDQTtBQUNBLFlBQUEsRUFBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQzNIQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxrQkFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLHlCQUFBO0FBQ0EsYUFBQSxFQUFBLDZDQUFBO0FBQ0EsWUFBQSxFQUFBLG1CQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBR0EsR0FBQSxDQUFBLFVBQUEsQ0FBQSxtQkFBQSxFQUFBLFVBQUEsWUFBQSxFQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxLQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7OztBQUdBLE9BQUEsQ0FBQSxPQUFBLEdBQUE7QUFDQSxNQUFBLEVBQUEsVUFBQTtBQUNBLGNBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLE9BQUEsSUFBQSxDQUFBLEdBQUEsS0FBQSxZQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0VBQ0E7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTs7QUFFQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsS0FBQSxFQUFBLFVBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsRUFBQTs7QUFFQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxTQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxlQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLEtBQUEsRUFBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQSxLQUNBLE1BQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7QUFFQSxVQUFBLFVBQUEsQ0FBQSxTQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsRUFBQSxJQUFBLENBQUEsQ0FBQTtFQUNBOzs7OztBQU1BLEtBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTs7QUFFQSxFQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLElBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSw4RkFBQTtFQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7Ozs7O0FBS0EsS0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQSxJQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsRUFBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTtBQUNBLGVBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLE9BQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQTs7O0FBR0EsS0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLEtBQUE7QUFDQSxVQUFBLEVBQUEsS0FBQTtBQUNBLFlBQUEsRUFBQSxLQUFBO0FBQ0EsU0FBQSxFQUFBLEtBQUE7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxVQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxNQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7RUFDQTtBQUNBLEtBQUEsTUFBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsTUFBQSxhQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsTUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLElBQUEsR0FBQSxDQUFBLENBQUEsU0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUE7O0FBRUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLGtCQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxRQUFBLEVBQUEsT0FBQSxTQUFBLENBQUE7QUFDQSxTQUFBLFNBQUEsQ0FBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDektBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSxrQ0FBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsYUFBQSxFQUFBLG9CQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxhQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsQ0FBQSxHQUFBLENBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxHQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsRUFBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxZQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxZQUFBLFVBQUEsQ0FBQSxZQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsVUFBQSxHQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsWUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDeENBLEdBQUEsQ0FBQSxPQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTs7QUFFQSxRQUFBOztBQUVBLGNBQUEsRUFBQSx3QkFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSxxQkFBQSxPQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsZUFBQSxFQUFBLHVCQUFBLE1BQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSx5QkFBQSxHQUFBLE1BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGNBQUEsR0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsU0FBQSxFQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxNQUFBLEdBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsY0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsWUFBQSxpQkFBQSxLQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsVUFBQSxDQUFBLGNBQUEsR0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDdkNBLEdBQUEsQ0FBQSxTQUFBLENBQUEsWUFBQSxFQUFBLFVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxPQUFBLEVBQUE7QUFDQSxPQUFBLEVBQUEsR0FBQTtBQUNBLFFBQUEsRUFBQSxHQUFBO0dBQ0E7QUFDQSxhQUFBLEVBQUEsbURBQUE7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7O0FBRUEsUUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSxlQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLFVBQUEsRUFBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLGVBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFdBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBO0dBRUE7RUFDQSxDQUFBO0NBRUEsQ0FBQSxDQUFBO0FDL0JBLEdBQUEsQ0FBQSxTQUFBLENBQUEsZUFBQSxFQUFBLFlBQUE7QUFDQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEseURBQUE7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDTEEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxRQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7O0FBRUEsUUFBQTtBQUNBLFVBQUEsRUFBQSxHQUFBO0FBQ0EsT0FBQSxFQUFBO0FBQ0EsT0FBQSxFQUFBLEdBQUE7QUFDQSxZQUFBLEVBQUEsR0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLHlDQUFBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOztBQUVBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLEVBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxRQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxDQUNBLENBQUE7O0FBRUEsUUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFVBQUEsR0FBQSxZQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLE9BQUEsT0FBQSxHQUFBLFNBQUEsT0FBQSxHQUFBO0FBQ0EsZUFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxPQUFBLFVBQUEsR0FBQSxTQUFBLFVBQUEsR0FBQTtBQUNBLFNBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxVQUFBLEVBQUEsQ0FBQTs7QUFFQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7OztBQUdBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUEsR0FBQSxFQUFBLElBQUEsS0FBQSxDQUFBLElBQUEsRUFBQTtBQUNBLE1BQUEsQ0FBQSxtQkFBQSxDQUFBLENBQUEsUUFBQSxDQUFBLGtCQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0tBQ0E7SUFDQSxDQUFBLENBQUE7OztBQUdBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsS0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxFQUFBLFlBQUE7QUFDQSxTQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxFQUFBLENBQUEsT0FBQSxDQUFBO0FBQ0EsZUFBQSxFQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsR0FBQTtNQUNBLEVBQUEsSUFBQSxFQUFBLGVBQUEsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBRUE7O0VBRUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUM5REEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLFNBQUEsRUFBQSxJQUFBO0FBQ0EsVUFBQSxFQUFBLDZFQUFBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLFlBQUEsQ0FBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTs7QUFFQSxhQUFBLENBQUEsR0FBQSxDQUFBLHFCQUFBLEVBQUEsWUFBQTtBQUNBLFdBQUEsQ0FBQSxRQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIFxuXG4gICAgICAgIHRoaXMuc2lnbnVwID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICAvL3NlbmRzIGEgcG9zdCByZXF1ZXN0IGNvbnRhaW5pbmcgdGhlIHVzZXIncyBjcmVkZW50aWFscyB0byBcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCdhcGkvdXNlcnMvc2lnbnVwJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLy9vbmNlIHRoZSB1c2VyIGhhcyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuLi5cbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvL2Egc2Vjb25kIHBvc3QgcmVxdWVzdCBpcyBjcmVhdGVkIHRvIGxvZyB0aGUgdXNlciBpblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIHNpZ251cCBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uIChzZXNzaW9uSWQsIHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KSgpO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9ob21lL2hvbWUuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdIb21lQ3RybCcsXG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIHJlcXVlc3RlZFVzZXI6IGZ1bmN0aW9uKEF1dGhTZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCByZXF1ZXN0ZWRVc2VyKSB7XG4gICAgLy8gSWYgdGhlcmUncyBhIGxvZ2dlZCBpbiB1c2VyIHVwb24gbG9hZCwgZ28gdG8gdGhlIGRhc2hib2FyZFxuICAgIGlmIChyZXF1ZXN0ZWRVc2VyKSAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHJlcXVlc3RlZFVzZXIuX2lkfSk7XG5cbiAgICAkc2NvcGUuaG9tZSA9IHRydWU7IC8vIFRvIGtub3cgd2hhdCBuYXYgbGlua3MgdG8gc2hvd1xuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5zaWdudXAgPSB7fTtcbiAgICAkc2NvcGUubG9naW5FcnJvciA9IG51bGw7XG4gICAgJHNjb3BlLnNpZ251cEVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIGNvbnNvbGUubG9nKCdsb2dpbkluZm8nLCBsb2dpbkluZm8pXG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ2luKGxvZ2luSW5mbykudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ2ZvdW5kIGV4aXN0aW5nIHVzZXInLCB1c2VyKTtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmxvZ2luRXJyb3IgPSBcIkkgdGhpbmsgeW91XFwndmUgZW50ZXJlZCB0aGUgd3JvbmcgaW5mbywgZnJpZW5kXCI7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2VuZFNpZ251cCA9IGZ1bmN0aW9uKHNpZ251cEluZm8pIHtcbiAgICAgICAgY29uc29sZS5sb2coJ2xvZ2luSW5mbycsIHNpZ251cEluZm8pXG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIEF1dGhTZXJ2aWNlLnNpZ251cChzaWdudXBJbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnbWFkZSBuZXcgdXNlcicsIHVzZXIpO1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiB1c2VyLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICRzY29wZS5zaWdudXBFcnJvciA9IFwiSSdtIGFmcmFpZCB3ZSBhbHJlYWR5IGhhdmUgc29tZW9uZSBieSB0aGF0IG5hbWVcIjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIFBhcmFsYXggZWZmZWN0IGZvciBpbWFnZXNcbiAgICAkKGZ1bmN0aW9uKCkge1xuICAgIC8vIENhY2hlIHRoZSB3aW5kb3cgb2JqZWN0IChtYWtlcyBsb2FkIHRpbWUgZmFzdGVyKVxuICAgIHZhciAkd2luZG93ID0gJCh3aW5kb3cpO1xuICAgIC8vIFBhcmFsbGF4IGJhY2tncm91bmQgZWZmZWN0XG4gICAgJCgnc2VjdGlvbltkYXRhLXR5cGU9XCJiYWNrZ3JvdW5kXCJdJykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyICRiZ29iaiA9ICQodGhpcyk7IC8vIGFzc2lnbmluZyB0aGUgb2JqZWN0XG4gICAgICAgICQod2luZG93KS5zY3JvbGwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL3Njcm9sbCB0aGUgYmFja2dyb3VuZCBhdCB2YXIgc3BlZWRcbiAgICAgICAgICAgIC8vIHRoZSB5UG9zIGlzIGEgbmVnYXRpdmUgYmVjYXVzZSB3ZSdyZSBzY3JvbGxpbmcgaXQgdXBcbiAgICAgICAgICAgIHZhciB5UG9zID0gLSgkd2luZG93LnNjcm9sbFRvcCgpIC8gJGJnb2JqLmRhdGEoJ3NwZWVkJykpO1xuICAgICAgICAgICAgLy8gUHV0IHRvZ2V0aGVyIG91ciBmaW5hbCBiYWNrZ3JvdW5kIHBvc2l0aW9uXG4gICAgICAgICAgICB2YXIgY29vcmRzID0gJzUwJSAnICsgeVBvcyArICdweCc7XG4gICAgICAgICAgICAvLyBNb3ZlIHRoZSBiYWNrZ3JvdW5kXG4gICAgICAgICAgICAkYmdvYmouY3NzKHsgYmFja2dyb3VuZFBvc2l0aW9uOiBjb29yZHMgfSk7XG4gICAgICAgIH0pOyAvLyBlbmQgd2luZG93IHNjcm9sbFxuICAgIH0pO1xufSk7XG5cblxuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3InLFxuXHRcdHtcblx0XHRcdHVybDogJy9lZGl0b3IvOmlkJyxcblx0XHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3QtZWRpdG9yL2VkaXRvci5odG1sJyxcblx0XHRcdGNvbnRyb2xsZXI6ICdFZGl0b3JDdHJsJyxcblx0XHQgICAgcmVzb2x2ZToge1xuXHRcdCAgICBcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0ICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQ7XG5cdFx0ICAgIFx0fVxuXHRcdCAgICB9LFxuXHRcdFx0ZGF0YToge1xuXHQgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuXHQgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRWRpdG9yQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZVBhcmFtcywgJHVpYk1vZGFsLCAkc3RhdGUsICRyb290U2NvcGUsIHF1ZXN0LCBTZXNzaW9uLCBRdWVzdEZhY3RvcnksIEF1dGhTZXJ2aWNlKSB7XG5cdC8vdmFyaWFibGUgc2F2ZWQgdG8gc2hvdy9oaWRlIHF1ZXN0IGVkaXRvciB3aGVuIGVkaXRpbmcgaW5kaXZpZHVhbCBzdGF0ZXNcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRzY29wZS52aWV3TWFpbk1hcCA9IHRydWU7XG5cdCRzY29wZS5uZXdRdWVzdCA9IGZhbHNlO1xuXHQvL2lmIHRoZXJlIGlzIG5vIHF1ZXN0LCBkZWZpbmUgb25lXG5cdGlmKCFxdWVzdCkge1xuXHRcdCRzY29wZS5uZXdRdWVzdCA9IHRydWU7XG5cdFx0JHNjb3BlLnF1ZXN0PSB7fTtcblx0fVxuXG5cdC8vdXBkYXRlIHF1ZXN0IGFuZCBnbyB0byBkYXNoYm9hcmQgZm9yIGN1cnJlbnQgdXNlclxuXHQkc2NvcGUuc2F2ZVF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuXHRcdC8vIGZpbHRlciBvdXQgYWxsIHF1ZXN0U3RlcHMgd2l0aG91dCB0YXJnZXRDaXJsY2xlcyBvciB0cmFuc2l0aW9uSW5mby50aXRsZVxuXHRcdGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwcykge1xuXHRcdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMgPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5maWx0ZXIoZnVuY3Rpb24oc3RlcCkge1xuXHRcdFx0XHRyZXR1cm4gKHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggJiYgc3RlcC50cmFuc2l0aW9uSW5mby50aXRsZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlTmV3KCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH07XG5cdC8vZ28gdG8gbWFwU3RhdGVzIGVkaXRvciBhbmQgaGlkZSBRdWVzdCBlZGl0b3IgXG5cdCRzY29wZS50cmFuc2l0aW9uVG9NYXBTdGF0ZUVkaXRvciA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRpZigkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IG51bGx9KTtcblx0XHRcdFx0fSBlbHNlIHsgXG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS5faWR9KTtcdFxuXHRcdFx0XHR9XG5cdFx0XHRcdCRzY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlTmV3KCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChzYXZlZFF1ZXN0KSB7XG5cdFx0XHRcdCRzY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtpZDogc2F2ZWRRdWVzdC5faWQsIHF1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH07XG5cblx0JHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgQXV0aFNlcnZpY2UubG9nb3V0KCkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICRzdGF0ZS5nbygnaG9tZScpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG5cdC8vKioqKioqKioqKiogIE1BUCBGVU5DVElPTlMgQkVMT1cgICoqKioqKioqKioqKioqKioqKioqKioqXG5cdHZhciB1c2VyTG9jYXRpb247XG5cdHZhciB0YXJnZXRDaXJjbGVzID0gW107XG5cdHZhciBjaXJjbGVDZW50ZXJzID0gW107XG5cdHZhciBxdWVzdE1hcCA9IEwubWFwKCdxdWVzdC1tYXAnKS5zZXRWaWV3KFs0MC43MjMwMDgsLTc0LjAwMDYzMjddLCAxMyk7XG5cdHF1ZXN0TWFwLnNjcm9sbFdoZWVsWm9vbS5kaXNhYmxlKCk7IC8vIFJlYWxseSBhbm5veWluZyB3aGVuIGl0IGhhcHBlbnMgYWNjaWRlbnRseVxuXHRMLnRpbGVMYXllcignaHR0cHM6Ly9hcGkudGlsZXMubWFwYm94LmNvbS92NC97aWR9L3t6fS97eH0ve3l9LnBuZz9hY2Nlc3NfdG9rZW49e2FjY2Vzc1Rva2VufScsIHtcbiAgICBtYXhab29tOiAxOCxcbiAgICBpZDogJ3Njb3R0ZWdncy5vNzYxNGpsMicsXG4gICAgYWNjZXNzVG9rZW46ICdway5leUoxSWpvaWMyTnZkSFJsWjJkeklpd2lZU0k2SW1OcGFEWm9aemhtZGpCak1EWjFjV281YUdjeWFYbHRlVGtpZlEuTFplMC1JQlJRbVowUGtRQnNZSWxpdydcblx0fSkuYWRkVG8ocXVlc3RNYXApO1xuXG5cdC8vIElmIHRoZXJlIGFyZSBubyB0YXJnZXRDaXJjbGVzIHlldCBjcmVhdGVkLCBzZXQgbWFwIHZpZXcgdG8gdXNlcidzIGxvY2F0aW9uXG5cdGlmICghJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMgfHwgISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUpIHtcblxuXHRcdHF1ZXN0TWFwLmxvY2F0ZSgpLm9uKCdsb2NhdGlvbmZvdW5kJywgZnVuY3Rpb24gKGUpIHtcblx0XHRcdHVzZXJMb2NhdGlvbiA9IFtlLmxhdGl0dWRlLGUubG9uZ2l0dWRlXTtcblx0XHRcdHF1ZXN0TWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBSZWRyYXcgYWxsIHRhcmdldENpcmNsZXMgZm9yIHRoZSBxdWVzdCBvbiB0aGUgbWFwIGFuZCByZXNldCB0aGUgYm91bmRzXG5cdGZ1bmN0aW9uIGRyYXdDaXJjbGVzKCkge1xuXHRcdC8vIFJlbW92ZSBhbGwgY2lyY2xlc1xuXHRcdHRhcmdldENpcmNsZXMuZm9yRWFjaChmdW5jdGlvbihjaXJjbGUpIHtcblx0XHRcdHF1ZXN0TWFwLnJlbW92ZUxheWVyKGNpcmNsZSk7XG5cdFx0fSk7XG5cdFx0Ly8gRHJhdyBhIGNpcmNsZSBmb3IgZXZlcnkgdGFyZ2V0Q2lyY2xlIGluIHRoZSBxdWVzdFxuXHRcdGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwcykge1xuXHRcdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZm9yRWFjaChmdW5jdGlvbihzdGVwLCBpbmRleCkge1xuXHRcdFx0XHRpZiAoc3RlcC50YXJnZXRDaXJjbGUgJiYgc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCkge1xuXHRcdFx0XHRcdHZhciBjZW50ZXIgPSBzdGVwLnRhcmdldENpcmNsZS5jZW50ZXI7XG5cdFx0XHRcdFx0dmFyIHJhZGl1cyA9IHN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cztcblx0XHRcdFx0XHR2YXIgY2lyY2xlID0gTC5jaXJjbGUoY2VudGVyLHJhZGl1cyk7XG5cdFx0XHRcdFx0Y2lyY2xlLmJpbmRMYWJlbCgoaW5kZXgrMSkudG9TdHJpbmcoKSwgeyBub0hpZGU6IHRydWUgfSkuYWRkVG8ocXVlc3RNYXApO1xuXHRcdFx0XHRcdHRhcmdldENpcmNsZXMucHVzaChjaXJjbGUpO1xuXHRcdFx0XHRcdGNpcmNsZUNlbnRlcnMucHVzaChzdGVwLnRhcmdldENpcmNsZS5jZW50ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmIChjaXJjbGVDZW50ZXJzLmxlbmd0aCkgcXVlc3RNYXAuZml0Qm91bmRzKGNpcmNsZUNlbnRlcnMpO1xuXHRcdH1cblx0fVxuXHRkcmF3Q2lyY2xlcygpO1xuXG59KTtcblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcbiRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3IucXVlc3RTdGVwJywge1xuXHRcdHVybDogJy9xdWVzdHN0ZXAvOnF1ZXN0U3RlcElkJywgXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy9xdWVzdC1zdGVwLWVkaXRvci9xdWVzdC1zdGVwLWVkaXRvci5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnUXVlc3RTdGVwRWRpdEN0cmwnLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG4gICAgXHRcdHJldHVybiAkc3RhdGVQYXJhbXMuaWQgIT09IFwiXCIgP1xuXHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0dW5kZWZpbmVkO1xuICAgIFx0XHR9XG5cdFx0fSxcblx0XHRkYXRhOiB7XG4gICAgICBcdFx0YXV0aGVudGljYXRlOiB0cnVlXG4gICAgXHR9XG5cdH0pO1xufSk7XG5cblxuYXBwLmNvbnRyb2xsZXIoJ1F1ZXN0U3RlcEVkaXRDdHJsJywgZnVuY3Rpb24gKCRzdGF0ZVBhcmFtcywgJHNjb3BlLCAkc3RhdGUsICRyb290U2NvcGUsIHF1ZXN0LCBRdWVzdEZhY3Rvcnkpe1xuXHQkc2NvcGUucXVlc3QgPSBxdWVzdDtcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdCRzY29wZS52aWV3TWFwID0gdHJ1ZTtcblx0dmFyIHVzZXJMb2NhdGlvbjtcblx0JHNjb3BlLnRhcmdldEVycm9yID0gZmFsc2U7XG5cdCRzY29wZS50aXRsZUVycm9yID0gZmFsc2U7XG5cblx0Ly9kZWZpbmQgbmV3IFN0ZXAgZm9yIGFkZGluZyB0byBzdGVwcyBhcnJheVxuXHQkc2NvcGUubmV3U3RlcCA9IHtcblx0XHRuYW1lOiAnTmV3IFN0ZXAnLFxuXHRcdHRhcmdldENpcmNsZToge1xuXHRcdFx0XHRjZW50ZXI6IFtdLFxuXHRcdFx0XHRyYWRpdXM6IG51bGxcblx0XHRcdH1cblx0XHR9O1xuXHQvLyBpZiB3ZSBoYXZlIHN0ZXBzLCBmaW5kIHRoZSBpbmRleCBvZiB0aGUgc3RlcCB0aGF0IG1hdGNoZXMgdGhlIHBhcmFtc1xuXHRpZigkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGggPiAwKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZm9yRWFjaCggZnVuY3Rpb24gKHN0ZXAsIGluZGV4KSB7XG5cdFx0XHRpZiAoc3RlcC5faWQgPT09ICRzdGF0ZVBhcmFtcy5xdWVzdFN0ZXBJZCkge1xuXHRcdFx0XHQkc2NvcGUucXVlc3QuaWR4ID0gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Ly9zZXRzIGN1cnJlbnRTdGVwIHRvIHRoYXQgbWF0Y2hpbmcgdGhlIHBhcmFtZXRlcnNcblx0XHQkc2NvcGUuY3VycmVudFN0ZXAgPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1skc2NvcGUucXVlc3QuaWR4XTtcblx0fSBlbHNlIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5wdXNoKCRzY29wZS5uZXdTdGVwKTtcblx0XHQkc2NvcGUuY3VycmVudFN0ZXAgPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXTtcblx0fVxuXHQvL2Z1bmN0aW9uIHRvIHN3aXRjaCBzdGF0ZXMgd2l0aGluIG1hcFN0YXRlIGVkaXRvclxuXHQkc2NvcGUuc3dpdGNoU3RlcCA9IGZ1bmN0aW9uIChjbGlja2VkU3RlcCkge1xuXHRcdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mby50aXRsZSkge1xuXHRcdFx0UXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gcmVkaXJlY3QgdG8gdGhlIGNsaWNrZWQgbWFwc3RhdGVcblx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBjbGlja2VkU3RlcC5faWR9KTtcdFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoKSBmbGFzaEVycm9yKCd0YXJnZXRFcnJvcicpO1xuXHRcdFx0aWYgKCEkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8gfHwgISRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mby50aXRsZSkgZmxhc2hFcnJvcigndGl0bGVFcnJvcicpO1xuXHRcdH1cblx0fTtcblx0JHNjb3BlLnNhdmVRdWVzdFN0ZXBzID0gZnVuY3Rpb24gKCkge1xuXHRcdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdC8vdXBkYXRlIHF1ZXN0XG5cdFx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6ICRzY29wZS5xdWVzdC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XHRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBmbGFzaEVycm9yKCd0YXJnZXRFcnJvcicpO1xuXHR9O1xuXHQkc2NvcGUuYWRkUXVlc3RTdGVwID0gZnVuY3Rpb24gKCkge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoLTFdLl9pZH0pO1xuXHRcdH0pO1xuXG5cdH07XG5cdCRzY29wZS5yZW1vdmVRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0dmFyIGluZGV4ID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuaW5kZXhPZigkc2NvcGUuY3VycmVudFN0ZXApO1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aWYgKGluZGV4ID09PSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgpIGluZGV4LS07XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0Ly8gSWYgcXVlc3QgaGFzIG5vIHN0ZXBzIG5vdywgcmV0dXJuIHRvIG1haW4gZWRpdG9yXG5cdFx0XHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCkgJHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6ICRzY29wZS5xdWVzdC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0XHRlbHNlICRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbaW5kZXhdLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0XHR9KTtcblx0fTtcblxuXHRmdW5jdGlvbiBmbGFzaEVycm9yKGVycm9yVHlwZSkge1xuXHRcdCRzY29wZVtlcnJvclR5cGVdID0gdHJ1ZTtcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0JHNjb3BlW2Vycm9yVHlwZV0gPSBmYWxzZTsgXG5cdFx0XHQkc2NvcGUuJGRpZ2VzdCgpO1xuXHRcdH0sIDMwMDApO1xuXHR9XG5cblxuXHQvLyBNQVAgQkVMT1cgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0+PlxuXG5cdC8vIGluaXRpYWxpemUgbWFwXG5cdHZhciBxdWVzdFN0ZXBNYXAgPSBMLm1hcCgncXVlc3Qtc3RlcC1tYXAnKTtcblx0cXVlc3RTdGVwTWFwLnNjcm9sbFdoZWVsWm9vbS5kaXNhYmxlKCk7IC8vIFJlYWxseSBhbm5veWluZyB3aGVuIGl0IGhhcHBlbnMgYWNjaWRlbnRseVxuXHQvL2FkZCBwaXJhdGUgbWFwIHRpbGVzXG5cdEwudGlsZUxheWVyKCdodHRwczovL2FwaS50aWxlcy5tYXBib3guY29tL3Y0L3tpZH0ve3p9L3t4fS97eX0ucG5nP2FjY2Vzc190b2tlbj17YWNjZXNzVG9rZW59Jywge1xuICAgIG1heFpvb206IDE4LFxuICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcbiAgICBhY2Nlc3NUb2tlbjogJ3BrLmV5SjFJam9pYzJOdmRIUmxaMmR6SWl3aVlTSTZJbU5wYURab1p6aG1kakJqTURaMWNXbzVhR2N5YVhsdGVUa2lmUS5MWmUwLUlCUlFtWjBQa1FCc1lJbGl3J1xuXHR9KS5hZGRUbyhxdWVzdFN0ZXBNYXApO1xuXG5cdC8vIFNldCB2aWV3IHVzaW5nIHRhcmdldENpcmNsZSBmb3IgdGhpcyBzdGVwIGlmIGRlZmluZWRcblx0Ly8gVGhlbiB0cnkgZmlyc3QgdGFyZ2V0Q2lyY2xlIGZvciBxdWVzdCBpZiBkZWZpbmVkXG5cdC8vIE90aGVyd2lzZSBnZXQgdXNlcidzIGxvY2F0aW9uIGFuZCBzZXQgbWFwIHZpZXcgd2l0aCB0aGF0XG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHRxdWVzdFN0ZXBNYXAuc2V0Vmlldygkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciwgMTUpO1xuXHR9IGVsc2UgaWYgKCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0udGFyZ2V0Q2lyY2xlLmNlbnRlciwgMTUpO1xuXHR9IGVsc2Uge1xuXHRcdHF1ZXN0U3RlcE1hcC5sb2NhdGUoKS5vbignbG9jYXRpb25mb3VuZCcsIGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR1c2VyTG9jYXRpb24gPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHRxdWVzdFN0ZXBNYXAuc2V0Vmlldyh1c2VyTG9jYXRpb24sIDE1KTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgdGhlIEZlYXR1cmVHcm91cCB0byBzdG9yZSBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGRyYXduSXRlbXMpO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIGRyYXcgY29udHJvbCBhbmQgcGFzcyBpdCB0aGUgRmVhdHVyZUdyb3VwIG9mIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd0NvbnRyb2wgPSBuZXcgTC5Db250cm9sLkRyYXcoe1xuXHQgICAgZHJhdzoge1xuXHQgICAgXHRwb2x5bGluZTogZmFsc2UsXG5cdCAgICBcdHBvbHlnb246IGZhbHNlLFxuXHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHQgICAgXHRtYXJrZXI6IGZhbHNlXG5cdCAgICB9LFxuXHQgICAgZWRpdDoge1xuXHQgICAgICAgIGZlYXR1cmVHcm91cDogZHJhd25JdGVtc1xuXHQgICAgfVxuXHR9KTtcblx0cXVlc3RTdGVwTWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXHQvL2lmIHRoZXJlIGlzIGEgdGFyZ2V0IHJlZ2lvbiwgZHJhdyBpdCBvbiB0aGUgbWFwXG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHR2YXIgY3VycmVudFJlZ2lvbiA9IEwuY2lyY2xlKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzKTtcblx0XHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY3VycmVudFJlZ2lvbik7XG5cdH1cblx0dmFyIGNpcmNsZTtcblx0cXVlc3RTdGVwTWFwLm9uKCdkcmF3OmNyZWF0ZWQnLCBmdW5jdGlvbiAoZSkge1xuXHQvL3JlbW92ZSB0aGUgbG9hZGVkIHJlZ2lvbiB0aGVuIHJlbW92ZSBhbnkgbmV3bHkgZHJhd24gY2lyY2xlc1xuICBcdGlmKGN1cnJlbnRSZWdpb24pIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjdXJyZW50UmVnaW9uKTtcbiAgXHRpZihjaXJjbGUpIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuICBcdHZhciB0eXBlID0gZS5sYXllclR5cGU7XG4gIFx0dmFyIGxheWVyID0gZS5sYXllcjtcbiAgXHQvL2Fzc2lnbiB0YXJnZXQgcmVnaW9uIHRvIHByb3BlcnRpZXMgb2YgZHJhd24gb2JqZWN0XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzID0gbGF5ZXIuX21SYWRpdXM7XG4gICAgLy9kZWNsYXJlIG5ldyBvYmplY3QgYmFzZWQgb24gcHJvcGVydGllZCBkcmF3biBhbmQgYWRkIHRvIG1hcFxuICAgIGNpcmNsZSA9IEwuY2lyY2xlKFtsYXllci5fbGF0bG5nLmxhdCxsYXllci5fbGF0bG5nLmxuZ10sIGxheWVyLl9tUmFkaXVzKTtcbiAgICBxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY2lyY2xlKTtcblx0fSk7XG5cblx0JHNjb3BlLmdldE1vZGFsQnV0dG9uVGV4dCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICgkc2NvcGUuY3VycmVudFN0ZXAgJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mby5xdWVzdGlvbikgcmV0dXJuIFwiU3VibWl0IVwiO1xuXHRcdHJldHVybiBcIkdvdCBpdCFcIjtcblx0fTtcbn0pO1xuXG5cblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGFzaGJvYXJkJyx7XG5cdFx0dXJsOiAnL2Rhc2hib2FyZC86dXNlcklkJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3VzZXItZGFzaGJvYXJkL2Rhc2hib2FyZC5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnRGFzaEN0cmwnLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdHVzZXJRdWVzdHM6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcblx0XHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5nZXRVc2VyUXVlc3RzKCRzdGF0ZVBhcmFtcy51c2VySWQpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgICAgICAgYXV0aGVudGljYXRlOiB0cnVlXG4gICAgICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0Rhc2hDdHJsJywgZnVuY3Rpb24gKCRzdGF0ZSwgJHNjb3BlLCB1c2VyUXVlc3RzLCBTZXNzaW9uLCBRdWVzdEZhY3Rvcnkpe1xuXHQkc2NvcGUucXVlc3RzID0gW107XG5cdCRzY29wZS5xdWVzdHMgPSB1c2VyUXVlc3RzLm1hcChmdW5jdGlvbihnKSB7IFxuXHRcdGcuc2hvd0RldGFpbCA9IGZhbHNlO1xuXHRcdHJldHVybiBnO1xuXHR9KTtcblxuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZVF1ZXN0ID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZGVsZXRlKHF1ZXN0Q2xpY2tlZClcblx0XHQudGhlbiggZnVuY3Rpb24gKGRlbGV0ZWRRdWVzdCkge1xuXHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pO1xuXHR9O1xuXHQkc2NvcGUucGFyZW50Q2xpY2sgPSBmdW5jdGlvbihpbmRleCkge1xuXHRcdHZhciBxdWVzdCA9ICRzY29wZS5xdWVzdHNbaW5kZXhdO1xuXHRcdHF1ZXN0LnNob3dEZXRhaWwgPSAhcXVlc3Quc2hvd0RldGFpbDtcblx0fTtcblx0JHNjb3BlLnN3aXRjaEFjdGl2ZSA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZShxdWVzdENsaWNrZWQpO1xuXHR9O1xuXG59KTtcblxuIiwiYXBwLmZhY3RvcnkoJ1F1ZXN0RmFjdG9yeScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbikge1xuXG5cdHJldHVybiB7XG5cblx0XHRnZXRBbGxRdWVzdHM6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMnKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKSB7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0Z2V0T25lUXVlc3Q6IGZ1bmN0aW9uKHF1ZXN0SWQpe1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0SWQpXG5cdFx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldFVzZXJRdWVzdHM6IGZ1bmN0aW9uKHVzZXJJZCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmdldCgnL2FwaS9xdWVzdHMvdXNlcnF1ZXN0cy8nICsgdXNlcklkKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24ocmVzKXtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzYXZlOiBmdW5jdGlvbiAocXVlc3QpIHtcblx0XHRcdHJldHVybiAkaHR0cC5wdXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdC5faWQsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZU5ldzogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRxdWVzdC5hdXRob3IgPSBTZXNzaW9uLnVzZXIuX2lkO1xuXHRcdFx0cmV0dXJuICRodHRwLnBvc3QoJy9hcGkvcXVlc3RzLycsIHF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAuZGVsZXRlKCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkKTtcblx0XHR9XG5cdH07XG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ2JsdWVIZWFkZXInLCBmdW5jdGlvbihBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cdFxuXHRyZXR1cm4ge1xuXHRcdHJlc3RyaWN0OiAnRScsXG5cdFx0c2NvcGU6IHtcblx0XHRcdGhlYWQ6ICdAJyxcblx0XHRcdHNtYWxsOiAnQCdcblx0XHR9LFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvYmx1ZS1oZWFkZXIvYmx1ZS1oZWFkZXIuaHRtbCcsXG5cdFx0bGluazogZnVuY3Rpb24oc2NvcGUpIHtcblxuXHRcdFx0c2NvcGUudXNlciA9IG51bGw7XG5cblx0XHRcdHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzZXRVc2VyKCk7XG5cblx0XHRcdHNjb3BlLmxvZ291dCA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRBdXRoU2VydmljZS5sb2dvdXQoKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHQkc3RhdGUuZ28oJ2hvbWUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0fVxuXHR9O1xuXG59KTsiLCJhcHAuZGlyZWN0aXZlKCdmdWxsc3RhY2tMb2dvJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvY29tbW9uL2RpcmVjdGl2ZXMvZnVsbHN0YWNrLWxvZ28vZnVsbHN0YWNrLWxvZ28uaHRtbCdcbiAgICB9O1xufSk7IiwiYXBwLmRpcmVjdGl2ZSgnbmF2YmFyJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEF1dGhTZXJ2aWNlLCBBVVRIX0VWRU5UUywgJHN0YXRlKSB7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICBzY29wZToge1xuICAgICAgICAgICAgaG9tZTogJz0nLFxuICAgICAgICAgICAgZGFzaGJvYXJkOiAnPSdcbiAgICAgICAgfSxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9jb21tb24vZGlyZWN0aXZlcy9uYXZiYXIvbmF2YmFyLmh0bWwnLFxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUpIHtcblxuICAgICAgICAgICAgc2NvcGUuaXRlbXMgPSBbXG4gICAgICAgICAgICAgICAgeyBsYWJlbDogJ0Rhc2hib2FyZCcsIHN0YXRlOiAnaG9tZScgLCBhdXRoOiB0cnVlfSxcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnTmV3IFF1ZXN0Jywgc3RhdGU6ICdlZGl0b3InLCBhdXRoOiB0cnVlIH1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuXG4gICAgICAgICAgICBzY29wZS5pc0xvZ2dlZEluID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciBzZXRVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUudXNlciA9IHVzZXI7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICB2YXIgcmVtb3ZlVXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gbnVsbDtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHNldFVzZXIoKTtcblxuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzLCBzZXRVc2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MsIHJlbW92ZVVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIHJlbW92ZVVzZXIpO1xuXG4gICAgICAgICAgICAvLyBQcmV0dHkgU2Nyb2xsaW5nIE5hdmJhciBFZmZlY3RcbiAgICAgICAgICAgICQod2luZG93KS5zY3JvbGwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKCQoJy5uYXZiYXInKS5vZmZzZXQoKS50b3AgPiA1MCAmJiBzY29wZS5ob21lKSB7XG4gICAgICAgICAgICAgICAgICAgICQoJy5uYXZiYXItZml4ZWQtdG9wJykuYWRkQ2xhc3MoJ3RvcC1uYXYtY29sbGFwc2UnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHNjb3BlLmhvbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5yZW1vdmVDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBBbmltYXRlZCBTY3JvbGwgVG8gU2VjdGlvblxuICAgICAgICAgICAgJChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAkKCcucGFnZS1zY3JvbGwgYScpLmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciAkYW5jaG9yID0gJCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgJCgnaHRtbCwgYm9keScpLnN0b3AoKS5hbmltYXRlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcm9sbFRvcDogJCgkYW5jaG9yLmF0dHIoJ2hyZWYnKSkub2Zmc2V0KCkudG9wXG4gICAgICAgICAgICAgICAgICAgIH0sIDE1MDAsICdlYXNlSW5PdXRFeHBvJyk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9XG5cbiAgICB9O1xuXG59KTtcbiIsImFwcC5kaXJlY3RpdmUoJ3Jlc29sdmVMb2FkZXInLCBmdW5jdGlvbigkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuXG4gIHJldHVybiB7XG4gICAgcmVzdHJpY3Q6ICdFJyxcbiAgICByZXBsYWNlOiB0cnVlLFxuICAgIHRlbXBsYXRlOiAnPGRpdiBjbGFzcz1cImFsZXJ0IGFsZXJ0LXN1Y2Nlc3MgbmctaGlkZVwiPjxzdHJvbmc+TG9hZGluZyB1cCE8L3N0cm9uZz48L2Rpdj4nLFxuICAgIGxpbms6IGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50KSB7XG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbihldmVudCwgY3VycmVudFJvdXRlLCBwcmV2aW91c1JvdXRlKSB7XG5cbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcygnbmctaGlkZScpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uKCkge1xuICAgICAgICBlbGVtZW50LmFkZENsYXNzKCduZy1oaWRlJyk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59KTsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
