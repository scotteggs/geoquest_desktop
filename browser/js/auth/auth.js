app.config(function ($stateProvider) {

    $stateProvider.state('auth', {
        url: '/',
        templateUrl: 'js/auth/auth.html',
        controller: 'AuthCtrl'
    });

});

app.controller('AuthCtrl', function ($scope, AuthService, $state) {

    $scope.login = {};
    $scope.signup = {};

    $scope.error = null;

    $scope.sendLogin = function (loginInfo) {


        $scope.error = null;

        AuthService.login(loginInfo).then(function (user) {
            console.log("login:user", user)
            $state.go('dashboard', {userId: user._id});
        }).catch(function () {
            $scope.error = 'Invalid login credentials.';
        });

    };

    $scope.sendSignup = function(signupInfo){
        $scope.error = null;

        AuthService.signup(signupInfo).then(function(){
            $state.go('dashboard');
        }).catch(function(){
            $scope.error = "Invalid Signup Credentials";
        })

    }

});