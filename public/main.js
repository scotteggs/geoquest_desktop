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
		quest.questSteps = quest.questSteps.filter(function (step) {
			return step.targetCircle.center.length && step.transitionInfo.title;
		});

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
			var stepDestination = $scope.quest.questSteps.length === 0 ? null : $scope.quest.questSteps[index]._id;
			$state.go('editor.questStep', { questStepId: stepDestination }, { reload: true });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwiaG9tZS9ob21lLmpzIiwicXVlc3QtZWRpdG9yL2VkaXRvci5qcyIsInF1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbG9hZGluZy9sb2FkaW5nLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBOztBQUVBLGVBQUEsQ0FBQSxLQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEsbUJBQUE7QUFDQSxZQUFBLEVBQUEsVUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsV0FBQSxFQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBRUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLEtBQUEsYUFBQSxFQUFBLE1BQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLGFBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFNBQUEsR0FBQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLEVBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsS0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxHQUFBLENBQUEscUJBQUEsRUFBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxTQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxVQUFBLEdBQUEsZ0RBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxHQUFBLENBQUEsZUFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFdBQUEsR0FBQSxpREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7O0FBR0EsRUFBQSxDQUFBLFlBQUE7O0FBRUEsTUFBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxpQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFlBQUE7QUFDQSxPQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7OztBQUdBLFFBQUEsSUFBQSxHQUFBLEVBQUEsT0FBQSxDQUFBLFNBQUEsRUFBQSxHQUFBLE1BQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxRQUFBLE1BQUEsR0FBQSxNQUFBLEdBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxVQUFBLENBQUEsR0FBQSxDQUFBLEVBQUEsa0JBQUEsRUFBQSxNQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBO0NBSUEsQ0FBQSxDQUFBO0FDcEVBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsRUFDQTtBQUNBLEtBQUEsRUFBQSxhQUFBO0FBQ0EsYUFBQSxFQUFBLDZCQUFBO0FBQ0EsWUFBQSxFQUFBLFlBQUE7QUFDQSxTQUFBLEVBQUE7QUFDQSxRQUFBLEVBQUEsZUFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsV0FBQSxZQUFBLENBQUEsRUFBQSxLQUFBLEVBQUEsR0FDQSxZQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxFQUFBLENBQUEsR0FDQSxTQUFBLENBQUE7SUFDQTtHQUNBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsZUFBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUEsQ0FBQTtDQUNBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsVUFBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLE1BQUEsRUFBQSxZQUFBLEVBQUEsU0FBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxZQUFBLEVBQUEsV0FBQSxFQUFBOztBQUVBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxRQUFBLEdBQUEsS0FBQSxDQUFBOztBQUVBLEtBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsUUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsRUFBQSxDQUFBO0VBQ0E7OztBQUdBLE9BQUEsQ0FBQSxTQUFBLEdBQUEsWUFBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLElBQUEsSUFBQSxDQUFBLGNBQUEsQ0FBQSxLQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxRQUFBLEVBQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsTUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsT0FBQSxDQUFBLDBCQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFFBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLFdBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0EsTUFBQTtBQUNBLFdBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0tBQ0E7QUFDQSxVQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFVBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLFVBQUEsQ0FBQSxHQUFBLEVBQUEsV0FBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsT0FBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsYUFBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7OztBQUdBLEtBQUEsWUFBQSxDQUFBO0FBQ0EsS0FBQSxhQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsS0FBQSxhQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsS0FBQSxRQUFBLEdBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQSxTQUFBLEVBQUEsQ0FBQSxVQUFBLENBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxlQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7QUFDQSxFQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLElBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSw4RkFBQTtFQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxFQUFBOztBQUVBLFVBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxFQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsZUFBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxDQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsT0FBQSxDQUFBLFlBQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBOzs7QUFHQSxVQUFBLFdBQUEsR0FBQTs7QUFFQSxlQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsTUFBQSxFQUFBO0FBQ0EsV0FBQSxDQUFBLFdBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTs7QUFFQSxNQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLFFBQUEsSUFBQSxDQUFBLFlBQUEsSUFBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsS0FBQSxHQUFBLENBQUEsQ0FBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxrQkFBQSxDQUFBLElBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0E7SUFDQSxDQUFBLENBQUE7QUFDQSxPQUFBLGFBQUEsQ0FBQSxNQUFBLEVBQUEsUUFBQSxDQUFBLFNBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0E7QUFDQSxZQUFBLEVBQUEsQ0FBQTtDQUVBLENBQUEsQ0FBQTs7QUN6SEEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxLQUFBLENBQUEsa0JBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSx5QkFBQTtBQUNBLGFBQUEsRUFBQSw2Q0FBQTtBQUNBLFlBQUEsRUFBQSxtQkFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLFFBQUEsRUFBQSxlQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTtJQUNBO0dBQ0E7QUFDQSxNQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsSUFBQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUdBLEdBQUEsQ0FBQSxVQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLFlBQUEsRUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLEtBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxXQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxPQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsS0FBQSxZQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsS0FBQSxDQUFBOzs7QUFHQSxPQUFBLENBQUEsT0FBQSxHQUFBO0FBQ0EsTUFBQSxFQUFBLFVBQUE7QUFDQSxjQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBOztBQUVBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxPQUFBLElBQUEsQ0FBQSxHQUFBLEtBQUEsWUFBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxHQUFBLEtBQUEsQ0FBQTtJQUNBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxXQUFBLEdBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQTtFQUNBOztBQUVBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLElBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLElBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7O0FBRUEsVUFBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsTUFBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBLFVBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxDQUFBLEtBQUEsRUFBQSxVQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsY0FBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUE7O0FBRUEsZUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBLFVBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsWUFBQSxHQUFBLFlBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUVBLENBQUE7QUFDQSxPQUFBLENBQUEsZUFBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLEtBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsRUFBQSxDQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsS0FBQSxLQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsRUFBQSxLQUFBLEVBQUEsQ0FBQTtBQUNBLFNBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEtBQUEsR0FBQSxZQUFBLENBQUE7QUFDQSxPQUFBLGVBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxHQUFBLElBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxLQUFBLENBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsZUFBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsQ0FBQTtFQUNBLENBQUE7O0FBRUEsVUFBQSxVQUFBLENBQUEsU0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLFNBQUEsQ0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLFlBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFNBQUEsQ0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTtHQUNBLEVBQUEsSUFBQSxDQUFBLENBQUE7RUFDQTs7Ozs7QUFNQSxLQUFBLFlBQUEsR0FBQSxDQUFBLENBQUEsR0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxlQUFBLENBQUEsT0FBQSxFQUFBLENBQUE7O0FBRUEsRUFBQSxDQUFBLFNBQUEsQ0FBQSxpRkFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLEVBQUE7QUFDQSxJQUFBLEVBQUEsb0JBQUE7QUFDQSxhQUFBLEVBQUEsOEZBQUE7RUFDQSxDQUFBLENBQUEsS0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBOzs7OztBQUtBLEtBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUEsSUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxjQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7RUFDQSxNQUFBO0FBQ0EsY0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEVBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxlQUFBLEdBQUEsQ0FBQSxDQUFBLENBQUEsUUFBQSxFQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtBQUNBLGVBQUEsQ0FBQSxPQUFBLENBQUEsWUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0E7OztBQUdBLEtBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQSxDQUFBLFlBQUEsRUFBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLFFBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQTs7O0FBR0EsS0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLE1BQUEsRUFBQTtBQUNBLFdBQUEsRUFBQSxLQUFBO0FBQ0EsVUFBQSxFQUFBLEtBQUE7QUFDQSxZQUFBLEVBQUEsS0FBQTtBQUNBLFNBQUEsRUFBQSxLQUFBO0dBQ0E7QUFDQSxNQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsVUFBQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsQ0FBQTs7QUFFQSxLQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEtBQUEsQ0FBQSxFQUFBO0FBQ0EsTUFBQSxhQUFBLEdBQUEsQ0FBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEVBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsUUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0VBQ0E7QUFDQSxLQUFBLE1BQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxFQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsQ0FBQSxFQUFBOztBQUVBLE1BQUEsYUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLE1BQUEsRUFBQSxZQUFBLENBQUEsV0FBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxJQUFBLEdBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLENBQUEsQ0FBQSxLQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsQ0FBQTtBQUNBLFFBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsR0FBQSxLQUFBLENBQUEsUUFBQSxDQUFBOztBQUVBLFFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLEVBQUEsS0FBQSxDQUFBLE9BQUEsQ0FBQSxHQUFBLENBQUEsRUFBQSxLQUFBLENBQUEsUUFBQSxDQUFBLENBQUE7QUFDQSxjQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxrQkFBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLE1BQUEsQ0FBQSxXQUFBLElBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLElBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsUUFBQSxFQUFBLE9BQUEsU0FBQSxDQUFBO0FBQ0EsU0FBQSxTQUFBLENBQUE7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3hLQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxXQUFBLEVBQUE7QUFDQSxLQUFBLEVBQUEsb0JBQUE7QUFDQSxhQUFBLEVBQUEsa0NBQUE7QUFDQSxZQUFBLEVBQUEsVUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLGFBQUEsRUFBQSxvQkFBQSxZQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsV0FBQSxZQUFBLENBQUEsYUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtJQUNBO0dBQ0E7QUFDQSxNQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsSUFBQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsVUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLE1BQUEsRUFBQSxVQUFBLEVBQUEsT0FBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxFQUFBO0FBQ0EsR0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEVBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLEVBQUEsWUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsWUFBQSxVQUFBLENBQUEsWUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsVUFBQSxLQUFBLEVBQUE7QUFDQSxNQUFBLEtBQUEsR0FBQSxNQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFlBQUEsR0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3ZDQSxHQUFBLENBQUEsT0FBQSxDQUFBLGNBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUE7O0FBRUEsUUFBQTs7QUFFQSxjQUFBLEVBQUEsd0JBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsYUFBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFVBQUEsR0FBQSxFQUFBO0FBQ0EsV0FBQSxHQUFBLENBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7QUFDQSxhQUFBLEVBQUEscUJBQUEsT0FBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGNBQUEsR0FBQSxPQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLGVBQUEsRUFBQSx1QkFBQSxNQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEseUJBQUEsR0FBQSxNQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLFNBQUEsRUFBQSxpQkFBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsTUFBQSxHQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxDQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsSUFBQSxDQUFBLGNBQUEsRUFBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLFlBQUEsaUJBQUEsS0FBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLFVBQUEsQ0FBQSxjQUFBLEdBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQ3ZDQSxHQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsRUFBQSxVQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7O0FBRUEsUUFBQTtBQUNBLFVBQUEsRUFBQSxHQUFBO0FBQ0EsT0FBQSxFQUFBO0FBQ0EsT0FBQSxFQUFBLEdBQUE7QUFDQSxRQUFBLEVBQUEsR0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLG1EQUFBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOztBQUVBLFFBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLE9BQUEsT0FBQSxHQUFBLFNBQUEsT0FBQSxHQUFBO0FBQ0EsZUFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxVQUFBLEVBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsTUFBQSxHQUFBLFlBQUE7QUFDQSxlQUFBLENBQUEsTUFBQSxFQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxXQUFBLENBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQTtHQUVBO0VBQ0EsQ0FBQTtDQUVBLENBQUEsQ0FBQTtBQy9CQSxHQUFBLENBQUEsU0FBQSxDQUFBLGVBQUEsRUFBQSxZQUFBO0FBQ0EsUUFBQTtBQUNBLFVBQUEsRUFBQSxHQUFBO0FBQ0EsYUFBQSxFQUFBLHlEQUFBO0VBQ0EsQ0FBQTtDQUNBLENBQUEsQ0FBQTtBQ0xBLEdBQUEsQ0FBQSxTQUFBLENBQUEsZUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFFBQUEsRUFBQTs7QUFFQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxTQUFBLEVBQUEsSUFBQTtBQUNBLFVBQUEsRUFBQSw2RUFBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUE7QUFDQSxhQUFBLENBQUEsR0FBQSxDQUFBLG1CQUFBLEVBQUEsVUFBQSxLQUFBLEVBQUEsWUFBQSxFQUFBLGFBQUEsRUFBQTs7QUFFQSxZQUFBLENBQUEsWUFBQTtBQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7O0FBRUEsYUFBQSxDQUFBLEdBQUEsQ0FBQSxxQkFBQSxFQUFBLFlBQUE7QUFDQSxXQUFBLENBQUEsUUFBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDbkJBLEdBQUEsQ0FBQSxTQUFBLENBQUEsUUFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLE9BQUEsRUFBQTtBQUNBLE9BQUEsRUFBQSxHQUFBO0FBQ0EsWUFBQSxFQUFBLEdBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSx5Q0FBQTtBQUNBLE1BQUEsRUFBQSxjQUFBLEtBQUEsRUFBQTs7QUFFQSxRQUFBLENBQUEsS0FBQSxHQUFBLENBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxFQUNBLEVBQUEsS0FBQSxFQUFBLFdBQUEsRUFBQSxLQUFBLEVBQUEsUUFBQSxFQUFBLElBQUEsRUFBQSxJQUFBLEVBQUEsQ0FDQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxVQUFBLEdBQUEsWUFBQTtBQUNBLFdBQUEsV0FBQSxDQUFBLGVBQUEsRUFBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxPQUFBLE9BQUEsR0FBQSxTQUFBLE9BQUEsR0FBQTtBQUNBLGVBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsT0FBQSxVQUFBLEdBQUEsU0FBQSxVQUFBLEdBQUE7QUFDQSxTQUFBLENBQUEsSUFBQSxHQUFBLElBQUEsQ0FBQTtJQUNBLENBQUE7O0FBRUEsVUFBQSxFQUFBLENBQUE7O0FBRUEsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxFQUFBLE9BQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxJQUFBLENBQUEsTUFBQSxDQUFBLENBQUEsTUFBQSxDQUFBLFlBQUE7QUFDQSxRQUFBLENBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxHQUFBLEdBQUEsRUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLEVBQUE7QUFDQSxNQUFBLENBQUEsbUJBQUEsQ0FBQSxDQUFBLFFBQUEsQ0FBQSxrQkFBQSxDQUFBLENBQUE7S0FDQSxNQUFBLElBQUEsS0FBQSxDQUFBLElBQUEsRUFBQTtBQUNBLE1BQUEsQ0FBQSxtQkFBQSxDQUFBLENBQUEsV0FBQSxDQUFBLGtCQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxJQUFBLENBQUEsWUFBQTtBQUNBLEtBQUEsQ0FBQSxnQkFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE9BQUEsRUFBQSxZQUFBO0FBQ0EsU0FBQSxPQUFBLEdBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBLElBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQTtBQUNBLGVBQUEsRUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUE7TUFDQSxFQUFBLElBQUEsRUFBQSxlQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxjQUFBLEVBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUVBOztFQUVBLENBQUE7Q0FFQSxDQUFBLENBQUEiLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcbndpbmRvdy5hcHAgPSBhbmd1bGFyLm1vZHVsZSgnR2VvUXVlc3QnLCBbJ2ZzYVByZUJ1aWx0JywgJ3VpLnJvdXRlcicsICd1aS5zb3J0YWJsZScsICd1aS5ib290c3RyYXAnLCAnbmdBbmltYXRlJywgJ2xlYWZsZXQtZGlyZWN0aXZlJ10pO1xuXG5hcHAuY29uZmlnKGZ1bmN0aW9uICgkdXJsUm91dGVyUHJvdmlkZXIsICRsb2NhdGlvblByb3ZpZGVyKSB7XG4gICAgLy8gVGhpcyB0dXJucyBvZmYgaGFzaGJhbmcgdXJscyAoLyNhYm91dCkgYW5kIGNoYW5nZXMgaXQgdG8gc29tZXRoaW5nIG5vcm1hbCAoL2Fib3V0KVxuICAgICRsb2NhdGlvblByb3ZpZGVyLmh0bWw1TW9kZSh0cnVlKTtcbiAgICAvLyBJZiB3ZSBnbyB0byBhIFVSTCB0aGF0IHVpLXJvdXRlciBkb2Vzbid0IGhhdmUgcmVnaXN0ZXJlZCwgZ28gdG8gdGhlIFwiL1wiIHVybC5cbiAgICAkdXJsUm91dGVyUHJvdmlkZXIub3RoZXJ3aXNlKCcvZGFzaGJvYXJkJyk7XG59KTtcblxuLy8gVGhpcyBhcHAucnVuIGlzIGZvciBjb250cm9sbGluZyBhY2Nlc3MgdG8gc3BlY2lmaWMgc3RhdGVzLlxuYXBwLnJ1bihmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXG4gICAgLy8gVGhlIGdpdmVuIHN0YXRlIHJlcXVpcmVzIGFuIGF1dGhlbnRpY2F0ZWQgdXNlci5cbiAgICB2YXIgZGVzdGluYXRpb25TdGF0ZVJlcXVpcmVzQXV0aCA9IGZ1bmN0aW9uIChzdGF0ZSkge1xuICAgICAgICByZXR1cm4gc3RhdGUuZGF0YSAmJiBzdGF0ZS5kYXRhLmF1dGhlbnRpY2F0ZTtcbiAgICB9O1xuXG4gICAgLy8gJHN0YXRlQ2hhbmdlU3RhcnQgaXMgYW4gZXZlbnQgZmlyZWRcbiAgICAvLyB3aGVuZXZlciB0aGUgcHJvY2VzcyBvZiBjaGFuZ2luZyBhIHN0YXRlIGJlZ2lucy5cbiAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbiAoZXZlbnQsIHRvU3RhdGUsIHRvUGFyYW1zKSB7XG5cbiAgICAgICAgaWYgKCFkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoKHRvU3RhdGUpKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVzdGluYXRpb24gc3RhdGUgZG9lcyBub3QgcmVxdWlyZSBhdXRoZW50aWNhdGlvblxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSkge1xuICAgICAgICAgICAgLy8gVGhlIHVzZXIgaXMgYXV0aGVudGljYXRlZC5cbiAgICAgICAgICAgIC8vIFNob3J0IGNpcmN1aXQgd2l0aCByZXR1cm4uXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYW5jZWwgbmF2aWdhdGluZyB0byBuZXcgc3RhdGUuXG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgLy8gSWYgYSB1c2VyIGlzIHJldHJpZXZlZCwgdGhlbiByZW5hdmlnYXRlIHRvIHRoZSBkZXN0aW5hdGlvblxuICAgICAgICAgICAgLy8gKHRoZSBzZWNvbmQgdGltZSwgQXV0aFNlcnZpY2UuaXNBdXRoZW50aWNhdGVkKCkgd2lsbCB3b3JrKVxuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlLCBpZiBubyB1c2VyIGlzIGxvZ2dlZCBpbiwgZ28gdG8gXCJsb2dpblwiIHN0YXRlLlxuICAgICAgICAgICAgaWYgKHVzZXIpIHtcbiAgICAgICAgICAgICAgICAkc3RhdGUuZ28odG9TdGF0ZS5uYW1lLCB0b1BhcmFtcyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbygnbG9naW4nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICB9KTtcblxufSk7XG4iLCIoZnVuY3Rpb24gKCkge1xuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8gSG9wZSB5b3UgZGlkbid0IGZvcmdldCBBbmd1bGFyISBEdWgtZG95LlxuICAgIGlmICghd2luZG93LmFuZ3VsYXIpIHRocm93IG5ldyBFcnJvcignSSBjYW5cXCd0IGZpbmQgQW5ndWxhciEnKTtcblxuICAgIHZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnZnNhUHJlQnVpbHQnLCBbXSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnU29ja2V0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXdpbmRvdy5pbykgdGhyb3cgbmV3IEVycm9yKCdzb2NrZXQuaW8gbm90IGZvdW5kIScpO1xuICAgICAgICByZXR1cm4gd2luZG93LmlvKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gQVVUSF9FVkVOVFMgaXMgdXNlZCB0aHJvdWdob3V0IG91ciBhcHAgdG9cbiAgICAvLyBicm9hZGNhc3QgYW5kIGxpc3RlbiBmcm9tIGFuZCB0byB0aGUgJHJvb3RTY29wZVxuICAgIC8vIGZvciBpbXBvcnRhbnQgZXZlbnRzIGFib3V0IGF1dGhlbnRpY2F0aW9uIGZsb3cuXG4gICAgYXBwLmNvbnN0YW50KCdBVVRIX0VWRU5UUycsIHtcbiAgICAgICAgbG9naW5TdWNjZXNzOiAnYXV0aC1sb2dpbi1zdWNjZXNzJyxcbiAgICAgICAgbG9naW5GYWlsZWQ6ICdhdXRoLWxvZ2luLWZhaWxlZCcsXG4gICAgICAgIGxvZ291dFN1Y2Nlc3M6ICdhdXRoLWxvZ291dC1zdWNjZXNzJyxcbiAgICAgICAgc2Vzc2lvblRpbWVvdXQ6ICdhdXRoLXNlc3Npb24tdGltZW91dCcsXG4gICAgICAgIG5vdEF1dGhlbnRpY2F0ZWQ6ICdhdXRoLW5vdC1hdXRoZW50aWNhdGVkJyxcbiAgICAgICAgbm90QXV0aG9yaXplZDogJ2F1dGgtbm90LWF1dGhvcml6ZWQnXG4gICAgfSk7XG5cbiAgICBhcHAuZmFjdG9yeSgnQXV0aEludGVyY2VwdG9yJywgZnVuY3Rpb24gKCRyb290U2NvcGUsICRxLCBBVVRIX0VWRU5UUykge1xuICAgICAgICB2YXIgc3RhdHVzRGljdCA9IHtcbiAgICAgICAgICAgIDQwMTogQVVUSF9FVkVOVFMubm90QXV0aGVudGljYXRlZCxcbiAgICAgICAgICAgIDQwMzogQVVUSF9FVkVOVFMubm90QXV0aG9yaXplZCxcbiAgICAgICAgICAgIDQxOTogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsXG4gICAgICAgICAgICA0NDA6IEFVVEhfRVZFTlRTLnNlc3Npb25UaW1lb3V0XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3Qoc3RhdHVzRGljdFtyZXNwb25zZS5zdGF0dXNdLCByZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdChyZXNwb25zZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIGFwcC5jb25maWcoZnVuY3Rpb24gKCRodHRwUHJvdmlkZXIpIHtcbiAgICAgICAgJGh0dHBQcm92aWRlci5pbnRlcmNlcHRvcnMucHVzaChbXG4gICAgICAgICAgICAnJGluamVjdG9yJyxcbiAgICAgICAgICAgIGZ1bmN0aW9uICgkaW5qZWN0b3IpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJGluamVjdG9yLmdldCgnQXV0aEludGVyY2VwdG9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIF0pO1xuICAgIH0pO1xuICAgIGFwcC5zZXJ2aWNlKCdBdXRoU2VydmljZScsIGZ1bmN0aW9uICgkaHR0cCwgU2Vzc2lvbiwgJHJvb3RTY29wZSwgQVVUSF9FVkVOVFMsICRxKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gb25TdWNjZXNzZnVsTG9naW4ocmVzcG9uc2UpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICAgICAgICAgIFNlc3Npb24uY3JlYXRlKGRhdGEuaWQsIGRhdGEudXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRicm9hZGNhc3QoQVVUSF9FVkVOVFMubG9naW5TdWNjZXNzKTtcbiAgICAgICAgICAgIHJldHVybiBkYXRhLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVc2VzIHRoZSBzZXNzaW9uIGZhY3RvcnkgdG8gc2VlIGlmIGFuXG4gICAgICAgIC8vIGF1dGhlbnRpY2F0ZWQgdXNlciBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5cbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISFTZXNzaW9uLnVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5nZXRMb2dnZWRJblVzZXIgPSBmdW5jdGlvbiAoZnJvbVNlcnZlcikge1xuXG4gICAgICAgICAgICAvLyBJZiBhbiBhdXRoZW50aWNhdGVkIHNlc3Npb24gZXhpc3RzLCB3ZVxuICAgICAgICAgICAgLy8gcmV0dXJuIHRoZSB1c2VyIGF0dGFjaGVkIHRvIHRoYXQgc2Vzc2lvblxuICAgICAgICAgICAgLy8gd2l0aCBhIHByb21pc2UuIFRoaXMgZW5zdXJlcyB0aGF0IHdlIGNhblxuICAgICAgICAgICAgLy8gYWx3YXlzIGludGVyZmFjZSB3aXRoIHRoaXMgbWV0aG9kIGFzeW5jaHJvbm91c2x5LlxuXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5LCBpZiB0cnVlIGlzIGdpdmVuIGFzIHRoZSBmcm9tU2VydmVyIHBhcmFtZXRlcixcbiAgICAgICAgICAgIC8vIHRoZW4gdGhpcyBjYWNoZWQgdmFsdWUgd2lsbCBub3QgYmUgdXNlZC5cblxuICAgICAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKCkgJiYgZnJvbVNlcnZlciAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiAkcS53aGVuKFNlc3Npb24udXNlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE1ha2UgcmVxdWVzdCBHRVQgL3Nlc3Npb24uXG4gICAgICAgICAgICAvLyBJZiBpdCByZXR1cm5zIGEgdXNlciwgY2FsbCBvblN1Y2Nlc3NmdWxMb2dpbiB3aXRoIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSA0MDEgcmVzcG9uc2UsIHdlIGNhdGNoIGl0IGFuZCBpbnN0ZWFkIHJlc29sdmUgdG8gbnVsbC5cbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5nZXQoJy9zZXNzaW9uJykudGhlbihvblN1Y2Nlc3NmdWxMb2dpbikuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmxvZ2luID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIGxvZ2luIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIFxuXG4gICAgICAgIHRoaXMuc2lnbnVwID0gZnVuY3Rpb24gKGNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICAvL3NlbmRzIGEgcG9zdCByZXF1ZXN0IGNvbnRhaW5pbmcgdGhlIHVzZXIncyBjcmVkZW50aWFscyB0byBcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCdhcGkvdXNlcnMvc2lnbnVwJywgY3JlZGVudGlhbHMpXG4gICAgICAgICAgICAgICAgLy9vbmNlIHRoZSB1c2VyIGhhcyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuLi5cbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvL2Egc2Vjb25kIHBvc3QgcmVxdWVzdCBpcyBjcmVhdGVkIHRvIGxvZyB0aGUgdXNlciBpblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJGh0dHAucG9zdCgnL2xvZ2luJywgY3JlZGVudGlhbHMpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4ob25TdWNjZXNzZnVsTG9naW4pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICRxLnJlamVjdCh7IG1lc3NhZ2U6ICdJbnZhbGlkIHNpZ251cCBjcmVkZW50aWFscy4nIH0pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9nb3V0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL2xvZ291dCcpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIFNlc3Npb24uZGVzdHJveSgpO1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dvdXRTdWNjZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbiAgICBhcHAuc2VydmljZSgnU2Vzc2lvbicsIGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUykge1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZWxmLmRlc3Ryb3koKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmlkID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcblxuICAgICAgICB0aGlzLmNyZWF0ZSA9IGZ1bmN0aW9uIChzZXNzaW9uSWQsIHVzZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBzZXNzaW9uSWQ7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSB1c2VyO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy51c2VyID0gbnVsbDtcbiAgICAgICAgfTtcblxuICAgIH0pO1xuXG59KSgpO1xuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpIHtcblxuICAgICRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdob21lJywge1xuICAgICAgICB1cmw6ICcvJyxcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdqcy9ob21lL2hvbWUuaHRtbCcsXG4gICAgICAgIGNvbnRyb2xsZXI6ICdIb21lQ3RybCcsXG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIHJlcXVlc3RlZFVzZXI6IGZ1bmN0aW9uKEF1dGhTZXJ2aWNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmdldExvZ2dlZEluVXNlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbn0pO1xuXG5hcHAuY29udHJvbGxlcignSG9tZUN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlLCByZXF1ZXN0ZWRVc2VyKSB7XG4gICAgLy8gSWYgdGhlcmUncyBhIGxvZ2dlZCBpbiB1c2VyIHVwb24gbG9hZCwgZ28gdG8gdGhlIGRhc2hib2FyZFxuICAgIGlmIChyZXF1ZXN0ZWRVc2VyKSAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHJlcXVlc3RlZFVzZXIuX2lkfSk7XG5cbiAgICAkc2NvcGUuaG9tZSA9IHRydWU7IC8vIFRvIGtub3cgd2hhdCBuYXYgbGlua3MgdG8gc2hvd1xuICAgICRzY29wZS5sb2dpbiA9IHt9O1xuICAgICRzY29wZS5zaWdudXAgPSB7fTtcbiAgICAkc2NvcGUubG9naW5FcnJvciA9IG51bGw7XG4gICAgJHNjb3BlLnNpZ251cEVycm9yID0gbnVsbDtcblxuICAgICRzY29wZS5zZW5kTG9naW4gPSBmdW5jdGlvbiAobG9naW5JbmZvKSB7XG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIGNvbnNvbGUubG9nKCdsb2dpbkluZm8nLCBsb2dpbkluZm8pXG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ2luKGxvZ2luSW5mbykudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ2ZvdW5kIGV4aXN0aW5nIHVzZXInLCB1c2VyKTtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgJHNjb3BlLmxvZ2luRXJyb3IgPSBcIkkgdGhpbmsgeW91XFwndmUgZW50ZXJlZCB0aGUgd3JvbmcgaW5mbywgZnJpZW5kXCI7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAkc2NvcGUuc2VuZFNpZ251cCA9IGZ1bmN0aW9uKHNpZ251cEluZm8pIHtcbiAgICAgICAgY29uc29sZS5sb2coJ2xvZ2luSW5mbycsIHNpZ251cEluZm8pXG4gICAgICAgICRzY29wZS5lcnJvciA9IG51bGw7XG4gICAgICAgIEF1dGhTZXJ2aWNlLnNpZ251cChzaWdudXBJbmZvKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnbWFkZSBuZXcgdXNlcicsIHVzZXIpO1xuICAgICAgICAgICAgJHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiB1c2VyLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcbiAgICAgICAgfSkuY2F0Y2goZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICRzY29wZS5zaWdudXBFcnJvciA9IFwiSSdtIGFmcmFpZCB3ZSBhbHJlYWR5IGhhdmUgc29tZW9uZSBieSB0aGF0IG5hbWVcIjtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIFBhcmFsYXggZWZmZWN0IGZvciBpbWFnZXNcbiAgICAkKGZ1bmN0aW9uKCkge1xuICAgIC8vIENhY2hlIHRoZSB3aW5kb3cgb2JqZWN0IChtYWtlcyBsb2FkIHRpbWUgZmFzdGVyKVxuICAgIHZhciAkd2luZG93ID0gJCh3aW5kb3cpO1xuICAgIC8vIFBhcmFsbGF4IGJhY2tncm91bmQgZWZmZWN0XG4gICAgJCgnc2VjdGlvbltkYXRhLXR5cGU9XCJiYWNrZ3JvdW5kXCJdJykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyICRiZ29iaiA9ICQodGhpcyk7IC8vIGFzc2lnbmluZyB0aGUgb2JqZWN0XG4gICAgICAgICQod2luZG93KS5zY3JvbGwoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvL3Njcm9sbCB0aGUgYmFja2dyb3VuZCBhdCB2YXIgc3BlZWRcbiAgICAgICAgICAgIC8vIHRoZSB5UG9zIGlzIGEgbmVnYXRpdmUgYmVjYXVzZSB3ZSdyZSBzY3JvbGxpbmcgaXQgdXBcbiAgICAgICAgICAgIHZhciB5UG9zID0gLSgkd2luZG93LnNjcm9sbFRvcCgpIC8gJGJnb2JqLmRhdGEoJ3NwZWVkJykpO1xuICAgICAgICAgICAgLy8gUHV0IHRvZ2V0aGVyIG91ciBmaW5hbCBiYWNrZ3JvdW5kIHBvc2l0aW9uXG4gICAgICAgICAgICB2YXIgY29vcmRzID0gJzUwJSAnICsgeVBvcyArICdweCc7XG4gICAgICAgICAgICAvLyBNb3ZlIHRoZSBiYWNrZ3JvdW5kXG4gICAgICAgICAgICAkYmdvYmouY3NzKHsgYmFja2dyb3VuZFBvc2l0aW9uOiBjb29yZHMgfSk7XG4gICAgICAgIH0pOyAvLyBlbmQgd2luZG93IHNjcm9sbFxuICAgIH0pO1xufSk7XG5cblxuXG59KTsiLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcil7XG5cdCRzdGF0ZVByb3ZpZGVyLnN0YXRlKCdlZGl0b3InLFxuXHRcdHtcblx0XHRcdHVybDogJy9lZGl0b3IvOmlkJyxcblx0XHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3QtZWRpdG9yL2VkaXRvci5odG1sJyxcblx0XHRcdGNvbnRyb2xsZXI6ICdFZGl0b3JDdHJsJyxcblx0XHQgICAgcmVzb2x2ZToge1xuXHRcdCAgICBcdHF1ZXN0OiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0ICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRcdFF1ZXN0RmFjdG9yeS5nZXRPbmVRdWVzdCgkc3RhdGVQYXJhbXMuaWQpIDogXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQ7XG5cdFx0ICAgIFx0fVxuXHRcdCAgICB9LFxuXHRcdFx0ZGF0YToge1xuXHQgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuXHQgICAgfVxuXHR9KTtcbn0pO1xuXG5hcHAuY29udHJvbGxlcignRWRpdG9yQ3RybCcsIGZ1bmN0aW9uICgkc2NvcGUsICRzdGF0ZVBhcmFtcywgJHVpYk1vZGFsLCAkc3RhdGUsICRyb290U2NvcGUsIHF1ZXN0LCBTZXNzaW9uLCBRdWVzdEZhY3RvcnksIEF1dGhTZXJ2aWNlKSB7XG5cdC8vdmFyaWFibGUgc2F2ZWQgdG8gc2hvdy9oaWRlIHF1ZXN0IGVkaXRvciB3aGVuIGVkaXRpbmcgaW5kaXZpZHVhbCBzdGF0ZXNcblx0JHJvb3RTY29wZS5lZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRzY29wZS52aWV3TWFpbk1hcCA9IHRydWU7XG5cdCRzY29wZS5uZXdRdWVzdCA9IGZhbHNlO1xuXHQvL2lmIHRoZXJlIGlzIG5vIHF1ZXN0LCBkZWZpbmUgb25lXG5cdGlmKCFxdWVzdCkge1xuXHRcdCRzY29wZS5uZXdRdWVzdCA9IHRydWU7XG5cdFx0JHNjb3BlLnF1ZXN0PSB7fTtcblx0fVxuXG5cdC8vdXBkYXRlIHF1ZXN0IGFuZCBnbyB0byBkYXNoYm9hcmQgZm9yIGN1cnJlbnQgdXNlclxuXHQkc2NvcGUuc2F2ZVF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuXHRcdC8vIGZpbHRlciBvdXQgYWxsIHF1ZXN0U3RlcHMgd2l0aG91dCB0YXJnZXRDaXJsY2xlcyBvciB0cmFuc2l0aW9uSW5mby50aXRsZVxuXHRcdHF1ZXN0LnF1ZXN0U3RlcHMgPSBxdWVzdC5xdWVzdFN0ZXBzLmZpbHRlcihmdW5jdGlvbihzdGVwKSB7XG5cdFx0XHRyZXR1cm4gKHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggJiYgc3RlcC50cmFuc2l0aW9uSW5mby50aXRsZSk7XG5cdFx0fSk7XG5cblx0XHRpZighJHNjb3BlLm5ld1F1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVx0XHRcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSk7XG5cdFx0XHR9KVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmVOZXcoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IFNlc3Npb24udXNlci5faWR9KTtcblx0XHRcdH0pXG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoc2F2ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7aWQ6IHNhdmVkUXVlc3QuX2lkLCBxdWVzdFN0ZXBJZDogbnVsbH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdCRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ291dCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHR2YXIgdGFyZ2V0Q2lyY2xlcyA9IFtdO1xuXHR2YXIgY2lyY2xlQ2VudGVycyA9IFtdO1xuXHR2YXIgcXVlc3RNYXAgPSBMLm1hcCgncXVlc3QtbWFwJykuc2V0VmlldyhbNDAuNzIzMDA4LC03NC4wMDA2MzI3XSwgMTMpO1xuXHRxdWVzdE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0TWFwKTtcblxuXHQvLyBJZiB0aGVyZSBhcmUgbm8gdGFyZ2V0Q2lyY2xlcyB5ZXQgY3JlYXRlZCwgc2V0IG1hcCB2aWV3IHRvIHVzZXIncyBsb2NhdGlvblxuXHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXSB8fCAhJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0udGFyZ2V0Q2lyY2xlKSB7XG5cblx0XHRxdWVzdE1hcC5sb2NhdGUoKS5vbignbG9jYXRpb25mb3VuZCcsIGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR1c2VyTG9jYXRpb24gPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHRxdWVzdE1hcC5zZXRWaWV3KHVzZXJMb2NhdGlvbiwgMTQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gUmVkcmF3IGFsbCB0YXJnZXRDaXJjbGVzIGZvciB0aGUgcXVlc3Qgb24gdGhlIG1hcCBhbmQgcmVzZXQgdGhlIGJvdW5kc1xuXHRmdW5jdGlvbiBkcmF3Q2lyY2xlcygpIHtcblx0XHQvLyBSZW1vdmUgYWxsIGNpcmNsZXNcblx0XHR0YXJnZXRDaXJjbGVzLmZvckVhY2goZnVuY3Rpb24oY2lyY2xlKSB7XG5cdFx0XHRxdWVzdE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuXHRcdH0pO1xuXHRcdC8vIERyYXcgYSBjaXJjbGUgZm9yIGV2ZXJ5IHRhcmdldENpcmNsZSBpbiB0aGUgcXVlc3Rcblx0XHRpZiAoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goZnVuY3Rpb24oc3RlcCwgaW5kZXgpIHtcblx0XHRcdFx0aWYgKHN0ZXAudGFyZ2V0Q2lyY2xlICYmIHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHR2YXIgY2VudGVyID0gc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyO1xuXHRcdFx0XHRcdHZhciByYWRpdXMgPSBzdGVwLnRhcmdldENpcmNsZS5yYWRpdXM7XG5cdFx0XHRcdFx0dmFyIGNpcmNsZSA9IEwuY2lyY2xlKGNlbnRlcixyYWRpdXMpO1xuXHRcdFx0XHRcdGNpcmNsZS5iaW5kTGFiZWwoKGluZGV4KzEpLnRvU3RyaW5nKCksIHsgbm9IaWRlOiB0cnVlIH0pLmFkZFRvKHF1ZXN0TWFwKTtcblx0XHRcdFx0XHR0YXJnZXRDaXJjbGVzLnB1c2goY2lyY2xlKTtcblx0XHRcdFx0XHRjaXJjbGVDZW50ZXJzLnB1c2goc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoY2lyY2xlQ2VudGVycy5sZW5ndGgpIHF1ZXN0TWFwLmZpdEJvdW5kcyhjaXJjbGVDZW50ZXJzKTtcblx0XHR9XG5cdH1cblx0ZHJhd0NpcmNsZXMoKTtcblxufSk7XG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG4kc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yLnF1ZXN0U3RlcCcsIHtcblx0XHR1cmw6ICcvcXVlc3RzdGVwLzpxdWVzdFN0ZXBJZCcsIFxuXHRcdHRlbXBsYXRlVXJsOiAnanMvcXVlc3Qtc3RlcC1lZGl0b3IvcXVlc3Qtc3RlcC1lZGl0b3IuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ1F1ZXN0U3RlcEVkaXRDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuICAgIFx0XHRyZXR1cm4gJHN0YXRlUGFyYW1zLmlkICE9PSBcIlwiID9cblx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdHVuZGVmaW5lZDtcbiAgICBcdFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgXHRcdGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgIFx0fVxuXHR9KTtcbn0pO1xuXG5cbmFwcC5jb250cm9sbGVyKCdRdWVzdFN0ZXBFZGl0Q3RybCcsIGZ1bmN0aW9uICgkc3RhdGVQYXJhbXMsICRzY29wZSwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLnF1ZXN0ID0gcXVlc3Q7XG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHQkc2NvcGUudmlld01hcCA9IHRydWU7XG5cdHZhciB1c2VyTG9jYXRpb247XG5cdCRzY29wZS50YXJnZXRFcnJvciA9IGZhbHNlO1xuXHQkc2NvcGUudGl0bGVFcnJvciA9IGZhbHNlO1xuXG5cdC8vZGVmaW5kIG5ldyBTdGVwIGZvciBhZGRpbmcgdG8gc3RlcHMgYXJyYXlcblx0JHNjb3BlLm5ld1N0ZXAgPSB7XG5cdFx0bmFtZTogJ05ldyBTdGVwJyxcblx0XHR0YXJnZXRDaXJjbGU6IHtcblx0XHRcdFx0Y2VudGVyOiBbXSxcblx0XHRcdFx0cmFkaXVzOiBudWxsXG5cdFx0XHR9XG5cdFx0fTtcblx0Ly8gaWYgd2UgaGF2ZSBzdGVwcywgZmluZCB0aGUgaW5kZXggb2YgdGhlIHN0ZXAgdGhhdCBtYXRjaGVzIHRoZSBwYXJhbXNcblx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID4gMCkge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goIGZ1bmN0aW9uIChzdGVwLCBpbmRleCkge1xuXHRcdFx0aWYgKHN0ZXAuX2lkID09PSAkc3RhdGVQYXJhbXMucXVlc3RTdGVwSWQpIHtcblx0XHRcdFx0JHNjb3BlLnF1ZXN0LmlkeCA9IGluZGV4O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdC8vc2V0cyBjdXJyZW50U3RlcCB0byB0aGF0IG1hdGNoaW5nIHRoZSBwYXJhbWV0ZXJzXG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbJHNjb3BlLnF1ZXN0LmlkeF07XG5cdH0gZWxzZSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0JHNjb3BlLmN1cnJlbnRTdGVwID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF07XG5cdH1cblx0Ly9mdW5jdGlvbiB0byBzd2l0Y2ggc3RhdGVzIHdpdGhpbiBtYXBTdGF0ZSBlZGl0b3Jcblx0JHNjb3BlLnN3aXRjaFN0ZXAgPSBmdW5jdGlvbiAoY2xpY2tlZFN0ZXApIHtcblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8udGl0bGUpIHtcblx0XHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIHJlZGlyZWN0IHRvIHRoZSBjbGlja2VkIG1hcHN0YXRlXG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogY2xpY2tlZFN0ZXAuX2lkfSk7XHRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoISRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCkgZmxhc2hFcnJvcigndGFyZ2V0RXJyb3InKTtcblx0XHRcdGlmICghJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvIHx8ICEkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8udGl0bGUpIGZsYXNoRXJyb3IoJ3RpdGxlRXJyb3InKTtcblx0XHR9XG5cdH07XG5cdCRzY29wZS5zYXZlUXVlc3RTdGVwcyA9IGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoKSB7XG5cdFx0XHQvL3VwZGF0ZSBxdWVzdFxuXHRcdFx0UXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yJywge2lkOiAkc2NvcGUucXVlc3QuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1x0XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgZmxhc2hFcnJvcigndGFyZ2V0RXJyb3InKTtcblx0fTtcblx0JHNjb3BlLmFkZFF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5wdXNoKCRzY29wZS5uZXdTdGVwKTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aC0xXS5faWR9KTtcblx0XHR9KTtcblxuXHR9O1xuXHQkc2NvcGUucmVtb3ZlUXVlc3RTdGVwID0gZnVuY3Rpb24gKCkge1xuXHRcdHZhciBpbmRleCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmluZGV4T2YoJHNjb3BlLmN1cnJlbnRTdGVwKTtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdGlmIChpbmRleCA9PT0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoKSBpbmRleC0tO1xuXHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdCRzY29wZS5xdWVzdCA9IHVwZGF0ZWRRdWVzdDtcblx0XHRcdHZhciBzdGVwRGVzdGluYXRpb24gPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGg9PT0wID8gbnVsbCA6ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzW2luZGV4XS5faWQ7XG5cdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IHN0ZXBEZXN0aW5hdGlvbn0sIHtyZWxvYWQ6IHRydWV9KTtcblx0XHR9KTtcblx0fTtcblxuXHRmdW5jdGlvbiBmbGFzaEVycm9yKGVycm9yVHlwZSkge1xuXHRcdCRzY29wZVtlcnJvclR5cGVdID0gdHJ1ZTtcblx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0JHNjb3BlW2Vycm9yVHlwZV0gPSBmYWxzZTsgXG5cdFx0XHQkc2NvcGUuJGRpZ2VzdCgpO1xuXHRcdH0sIDMwMDApO1xuXHR9XG5cblxuXHQvLyBNQVAgQkVMT1cgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0+PlxuXG5cdC8vIGluaXRpYWxpemUgbWFwXG5cdHZhciBxdWVzdFN0ZXBNYXAgPSBMLm1hcCgncXVlc3Qtc3RlcC1tYXAnKTtcblx0cXVlc3RTdGVwTWFwLnNjcm9sbFdoZWVsWm9vbS5kaXNhYmxlKCk7IC8vIFJlYWxseSBhbm5veWluZyB3aGVuIGl0IGhhcHBlbnMgYWNjaWRlbnRseVxuXHQvL2FkZCBwaXJhdGUgbWFwIHRpbGVzXG5cdEwudGlsZUxheWVyKCdodHRwczovL2FwaS50aWxlcy5tYXBib3guY29tL3Y0L3tpZH0ve3p9L3t4fS97eX0ucG5nP2FjY2Vzc190b2tlbj17YWNjZXNzVG9rZW59Jywge1xuICAgIG1heFpvb206IDE4LFxuICAgIGlkOiAnc2NvdHRlZ2dzLm83NjE0amwyJyxcbiAgICBhY2Nlc3NUb2tlbjogJ3BrLmV5SjFJam9pYzJOdmRIUmxaMmR6SWl3aVlTSTZJbU5wYURab1p6aG1kakJqTURaMWNXbzVhR2N5YVhsdGVUa2lmUS5MWmUwLUlCUlFtWjBQa1FCc1lJbGl3J1xuXHR9KS5hZGRUbyhxdWVzdFN0ZXBNYXApO1xuXG5cdC8vIFNldCB2aWV3IHVzaW5nIHRhcmdldENpcmNsZSBmb3IgdGhpcyBzdGVwIGlmIGRlZmluZWRcblx0Ly8gVGhlbiB0cnkgZmlyc3QgdGFyZ2V0Q2lyY2xlIGZvciBxdWVzdCBpZiBkZWZpbmVkXG5cdC8vIE90aGVyd2lzZSBnZXQgdXNlcidzIGxvY2F0aW9uIGFuZCBzZXQgbWFwIHZpZXcgd2l0aCB0aGF0XG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHRxdWVzdFN0ZXBNYXAuc2V0Vmlldygkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciwgMTUpO1xuXHR9IGVsc2UgaWYgKCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0udGFyZ2V0Q2lyY2xlLmNlbnRlciwgMTUpO1xuXHR9IGVsc2Uge1xuXHRcdHF1ZXN0U3RlcE1hcC5sb2NhdGUoKS5vbignbG9jYXRpb25mb3VuZCcsIGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR1c2VyTG9jYXRpb24gPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHRxdWVzdFN0ZXBNYXAuc2V0Vmlldyh1c2VyTG9jYXRpb24sIDE1KTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIEluaXRpYWxpemUgdGhlIEZlYXR1cmVHcm91cCB0byBzdG9yZSBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXduSXRlbXMgPSBuZXcgTC5GZWF0dXJlR3JvdXAoKTtcblx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGRyYXduSXRlbXMpO1xuXG5cdC8vIEluaXRpYWxpemUgdGhlIGRyYXcgY29udHJvbCBhbmQgcGFzcyBpdCB0aGUgRmVhdHVyZUdyb3VwIG9mIGVkaXRhYmxlIGxheWVyc1xuXHR2YXIgZHJhd0NvbnRyb2wgPSBuZXcgTC5Db250cm9sLkRyYXcoe1xuXHQgICAgZHJhdzoge1xuXHQgICAgXHRwb2x5bGluZTogZmFsc2UsXG5cdCAgICBcdHBvbHlnb246IGZhbHNlLFxuXHQgICAgXHRyZWN0YW5nbGU6IGZhbHNlLFxuXHQgICAgXHRtYXJrZXI6IGZhbHNlXG5cdCAgICB9LFxuXHQgICAgZWRpdDoge1xuXHQgICAgICAgIGZlYXR1cmVHcm91cDogZHJhd25JdGVtc1xuXHQgICAgfVxuXHR9KTtcblx0cXVlc3RTdGVwTWFwLmFkZENvbnRyb2woZHJhd0NvbnRyb2wpO1xuXHQvL2lmIHRoZXJlIGlzIGEgdGFyZ2V0IHJlZ2lvbiwgZHJhdyBpdCBvbiB0aGUgbWFwXG5cdGlmICgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGggPT09IDIpIHtcblx0XHR2YXIgY3VycmVudFJlZ2lvbiA9IEwuY2lyY2xlKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzKTtcblx0XHRxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY3VycmVudFJlZ2lvbik7XG5cdH1cblx0dmFyIGNpcmNsZTtcblx0cXVlc3RTdGVwTWFwLm9uKCdkcmF3OmNyZWF0ZWQnLCBmdW5jdGlvbiAoZSkge1xuXHQvL3JlbW92ZSB0aGUgbG9hZGVkIHJlZ2lvbiB0aGVuIHJlbW92ZSBhbnkgbmV3bHkgZHJhd24gY2lyY2xlc1xuICBcdGlmKGN1cnJlbnRSZWdpb24pIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjdXJyZW50UmVnaW9uKTtcbiAgXHRpZihjaXJjbGUpIHF1ZXN0U3RlcE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuICBcdHZhciB0eXBlID0gZS5sYXllclR5cGU7XG4gIFx0dmFyIGxheWVyID0gZS5sYXllcjtcbiAgXHQvL2Fzc2lnbiB0YXJnZXQgcmVnaW9uIHRvIHByb3BlcnRpZXMgb2YgZHJhd24gb2JqZWN0XG4gICAgJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIgPSBbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddO1xuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUucmFkaXVzID0gbGF5ZXIuX21SYWRpdXM7XG4gICAgLy9kZWNsYXJlIG5ldyBvYmplY3QgYmFzZWQgb24gcHJvcGVydGllZCBkcmF3biBhbmQgYWRkIHRvIG1hcFxuICAgIGNpcmNsZSA9IEwuY2lyY2xlKFtsYXllci5fbGF0bG5nLmxhdCxsYXllci5fbGF0bG5nLmxuZ10sIGxheWVyLl9tUmFkaXVzKTtcbiAgICBxdWVzdFN0ZXBNYXAuYWRkTGF5ZXIoY2lyY2xlKTtcblx0fSk7XG5cblx0JHNjb3BlLmdldE1vZGFsQnV0dG9uVGV4dCA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICgkc2NvcGUuY3VycmVudFN0ZXAgJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mby5xdWVzdGlvbikgcmV0dXJuIFwiU3VibWl0IVwiO1xuXHRcdHJldHVybiBcIkdvdCBpdCFcIjtcblx0fTtcbn0pO1xuXG5cblxuIiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZGFzaGJvYXJkJyx7XG5cdFx0dXJsOiAnL2Rhc2hib2FyZC86dXNlcklkJyxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3VzZXItZGFzaGJvYXJkL2Rhc2hib2FyZC5odG1sJyxcblx0XHRjb250cm9sbGVyOiAnRGFzaEN0cmwnLFxuXHRcdHJlc29sdmU6IHtcblx0XHRcdHVzZXJRdWVzdHM6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcblx0XHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5nZXRVc2VyUXVlc3RzKCRzdGF0ZVBhcmFtcy51c2VySWQpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0ZGF0YToge1xuICAgICAgICAgICAgYXV0aGVudGljYXRlOiB0cnVlXG4gICAgICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0Rhc2hDdHJsJywgZnVuY3Rpb24gKCRzdGF0ZSwgJHNjb3BlLCB1c2VyUXVlc3RzLCBTZXNzaW9uLCBRdWVzdEZhY3Rvcnkpe1xuXHQkc2NvcGUucXVlc3RzID0gW107XG5cdCRzY29wZS5xdWVzdHMgPSB1c2VyUXVlc3RzLm1hcChmdW5jdGlvbihnKSB7IFxuXHRcdGcuc2hvd0RldGFpbCA9IGZhbHNlO1xuXHRcdHJldHVybiBnO1xuXHR9KTtcblxuXHQkc2NvcGUuZ29Ub0VkaXRvciA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogcXVlc3RDbGlja2VkLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0fTtcblx0JHNjb3BlLmRlbGV0ZVF1ZXN0ID0gZnVuY3Rpb24gKHF1ZXN0Q2xpY2tlZCkge1xuXHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZGVsZXRlKHF1ZXN0Q2xpY2tlZClcblx0XHQudGhlbiggZnVuY3Rpb24gKGRlbGV0ZWRRdWVzdCkge1xuXHRcdFx0JHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiBTZXNzaW9uLnVzZXIuX2lkfSwge3JlbG9hZDogdHJ1ZX0pO1xuXHRcdH0pO1xuXHR9O1xuXHQkc2NvcGUucGFyZW50Q2xpY2sgPSBmdW5jdGlvbihpbmRleCkge1xuXHRcdHZhciBxdWVzdCA9ICRzY29wZS5xdWVzdHNbaW5kZXhdO1xuXHRcdHF1ZXN0LnNob3dEZXRhaWwgPSAhcXVlc3Quc2hvd0RldGFpbDtcblx0fTtcblx0JHNjb3BlLnN3aXRjaEFjdGl2ZSA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRRdWVzdEZhY3Rvcnkuc2F2ZShxdWVzdENsaWNrZWQpO1xuXHR9O1xufSk7XG5cbiIsImFwcC5mYWN0b3J5KCdRdWVzdEZhY3RvcnknLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24pIHtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsUXVlc3RzOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzJylcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldE9uZVF1ZXN0OiBmdW5jdGlvbihxdWVzdElkKXtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdElkKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbihyZXMpe1xuXHRcdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdFx0fSk7XG5cdFx0fSxcblx0XHRnZXRVc2VyUXVlc3RzOiBmdW5jdGlvbih1c2VySWQpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzL3VzZXJxdWVzdHMvJyArIHVzZXJJZClcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAucHV0KCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpe1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdHNhdmVOZXc6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cXVlc3QuYXV0aG9yID0gU2Vzc2lvbi51c2VyLl9pZDtcblx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL3F1ZXN0cy8nLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRkZWxldGU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmRlbGV0ZSgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCk7XG5cdFx0fVxuXHR9O1xufSk7XG4iLCJhcHAuZGlyZWN0aXZlKCdibHVlSGVhZGVyJywgZnVuY3Rpb24oQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXHRcblx0cmV0dXJuIHtcblx0XHRyZXN0cmljdDogJ0UnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRoZWFkOiAnQCcsXG5cdFx0XHRzbWFsbDogJ0AnXG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2JsdWUtaGVhZGVyL2JsdWUtaGVhZGVyLmh0bWwnLFxuXHRcdGxpbms6IGZ1bmN0aW9uKHNjb3BlKSB7XG5cblx0XHRcdHNjb3BlLnVzZXIgPSBudWxsO1xuXG5cdFx0XHR2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG5cdFx0XHRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0QXV0aFNlcnZpY2UubG9nb3V0KClcblx0XHRcdFx0LnRoZW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdob21lJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdH1cblx0fTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ3Jlc29sdmVMb2FkZXInLCBmdW5jdGlvbigkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuXG4gIHJldHVybiB7XG4gICAgcmVzdHJpY3Q6ICdFJyxcbiAgICByZXBsYWNlOiB0cnVlLFxuICAgIHRlbXBsYXRlOiAnPGRpdiBjbGFzcz1cImFsZXJ0IGFsZXJ0LXN1Y2Nlc3MgbmctaGlkZVwiPjxzdHJvbmc+TG9hZGluZyB1cCE8L3N0cm9uZz48L2Rpdj4nLFxuICAgIGxpbms6IGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50KSB7XG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbihldmVudCwgY3VycmVudFJvdXRlLCBwcmV2aW91c1JvdXRlKSB7XG5cbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcygnbmctaGlkZScpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uKCkge1xuICAgICAgICBlbGVtZW50LmFkZENsYXNzKCduZy1oaWRlJyk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59KTsiLCJhcHAuZGlyZWN0aXZlKCduYXZiYXInLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsIEFVVEhfRVZFTlRTLCAkc3RhdGUpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBob21lOiAnPScsXG4gICAgICAgICAgICBkYXNoYm9hcmQ6ICc9J1xuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgICAgICAgICBzY29wZS5pdGVtcyA9IFtcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnRGFzaGJvYXJkJywgc3RhdGU6ICdob21lJyAsIGF1dGg6IHRydWV9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdOZXcgUXVlc3QnLCBzdGF0ZTogJ2VkaXRvcicsIGF1dGg6IHRydWUgfVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG5cbiAgICAgICAgICAgIHNjb3BlLmlzTG9nZ2VkSW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHNldFVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gdXNlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciByZW1vdmVVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MsIHNldFVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9nb3V0U3VjY2VzcywgcmVtb3ZlVXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgcmVtb3ZlVXNlcik7XG5cbiAgICAgICAgICAgIC8vIFByZXR0eSBTY3JvbGxpbmcgTmF2YmFyIEVmZmVjdFxuICAgICAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoJCgnLm5hdmJhcicpLm9mZnNldCgpLnRvcCA+IDUwICYmIHNjb3BlLmhvbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5hZGRDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLnJlbW92ZUNsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEFuaW1hdGVkIFNjcm9sbCBUbyBTZWN0aW9uXG4gICAgICAgICAgICAkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICQoJy5wYWdlLXNjcm9sbCBhJykuYmluZCgnY2xpY2snLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyICRhbmNob3IgPSAkKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAkKCdodG1sLCBib2R5Jykuc3RvcCgpLmFuaW1hdGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsVG9wOiAkKCRhbmNob3IuYXR0cignaHJlZicpKS5vZmZzZXQoKS50b3BcbiAgICAgICAgICAgICAgICAgICAgfSwgMTUwMCwgJ2Vhc2VJbk91dEV4cG8nKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
